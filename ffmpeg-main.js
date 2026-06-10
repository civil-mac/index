export class FFmpeg {
    constructor() {
        this.listeners = {};
        this.loaded = false;
        this.worker = null;
        this.cmdId = 0;
        this.resolves = {};
        this.rejects = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
    }

    async load(config = {}) {
        if (this.loaded) return;

        const absCore = new URL(config.coreURL || './ffmpeg-core.js', window.location.href).href;
        const absWasm = new URL(config.wasmURL || './ffmpeg-core.wasm', window.location.href).href;

        // ffmpeg-core.js's internal _locateFile() reads Module["mainScriptUrlOrBlob"].
        // It expects a URL whose fragment (#) is a base64-encoded JSON object of the form:
        //   { wasmURL: "https://...", workerURL: "https://..." }
        // The locateFile callback passed to createFFmpegCore() is overridden by the
        // core's own _locateFile, so this is the ONLY way to inject the wasm path.
        const coreConfig = JSON.stringify({ wasmURL: absWasm, workerURL: '' });
        const coreConfigB64 = btoa(coreConfig);
        // Append the config as a fragment so the core can parse it from import.meta.url
        // or from mainScriptUrlOrBlob when running inside a worker.
        const coreURLWithConfig = `${absCore}#${coreConfigB64}`;

        const workerCode = `
            import createFFmpegCore from "${absCore}";

            // Inject the mainScriptUrlOrBlob so the core's _locateFile can find ffmpeg-core.wasm
            const _coreConfigB64 = "${coreConfigB64}";

            onmessage = async (e) => {
                const { id, type, method, args } = e.data;

                if (type === "init") {
                    try {
                        self.FFmpegCore = await createFFmpegCore({
                            // Provide mainScriptUrlOrBlob with the base64 config fragment
                            // This is what ffmpeg-core.js's _locateFile() actually reads
                            mainScriptUrlOrBlob: "data:text/javascript," + "#" + _coreConfigB64,
                            // Also wire up logging and progress
                            print:    (message) => postMessage({ type: "log",      data: { type: "stdout", message } }),
                            printErr: (message) => postMessage({ type: "log",      data: { type: "stderr", message } }),
                        });
                        // Override progress handler after init
                        self.FFmpegCore.setProgress(({ progress, time }) =>
                            postMessage({ type: "progress", data: { progress, time } })
                        );
                        // Override logger to capture loudnorm JSON from stderr
                        self.FFmpegCore.setLogger(({ type: t, message }) =>
                            postMessage({ type: "log", data: { type: t, message } })
                        );
                        postMessage({ id, type: "done" });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message || String(err) });
                    }
                }

                if (type === "exec") {
                    try {
                        // args[0] is the array of CLI arguments e.g. ["-i","input.wav",...]
                        // FFmpegCore.exec() accepts a spread of string args
                        const ret = self.FFmpegCore.exec(...args[0]);
                        postMessage({ id, type: "done", ret });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message || String(err) });
                    }
                }

                if (type === "fs") {
                    try {
                        // method is the FS method name e.g. "writeFile", "readFile", "unlink"
                        // args is the argument array for that method
                        const ret = self.FFmpegCore.FS[method](...args);
                        postMessage({ id, type: "done", ret });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message || String(err) });
                    }
                }
            };
        `;

        const blob = new Blob([workerCode], { type: "text/javascript" });
        const blobURL = URL.createObjectURL(blob);
        this.worker = new Worker(blobURL, { type: "module" });

        this.worker.onmessage = (e) => {
            const { id, type, data, error, ret } = e.data;
            if (type === "log")      this.emit("log",      data);
            if (type === "progress") this.emit("progress", data);
            if (type === "done" && this.resolves[id]) {
                this.resolves[id](ret);
                delete this.resolves[id];
                delete this.rejects[id];
            }
            if (type === "error" && this.rejects[id]) {
                this.rejects[id](new Error(error));
                delete this.resolves[id];
                delete this.rejects[id];
            }
        };

        this.worker.onerror = (e) => {
            // Catch module worker import errors (e.g. 404 on ffmpeg-core.js)
            const pending = Object.keys(this.rejects);
            if (pending.length) {
                this.rejects[pending[0]](new Error("Worker error: " + e.message));
            }
        };

        await this.send("init");
        this.loaded = true;
    }

    send(type, method = "", args = []) {
        return new Promise((resolve, reject) => {
            const id = this.cmdId++;
            this.resolves[id] = resolve;
            this.rejects[id] = reject;
            this.worker.postMessage({ id, type, method, args });
        });
    }

    async writeFile(path, data) {
        return this.send("fs", "writeFile", [path, data]);
    }
    async readFile(path, encoding = "binary") {
        return this.send("fs", "readFile", [path, { encoding }]);
    }
    async deleteFile(path) {
        return this.send("fs", "unlink", [path]);
    }
    async exec(args) {
        // Pass as args[0] — the worker unpacks it with ...args[0]
        return this.send("exec", "", [args]);
    }
    terminate() {
        if (this.worker) this.worker.terminate();
        this.loaded = false;
    }
}
