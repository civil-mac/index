// ffmpeg-main.js - Local ESM implementation compatible with @ffmpeg/ffmpeg v0.12+ API
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
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    async load(config = {}) {
        if (this.loaded) return;
        const { coreURL, wasmURL } = config;

        // Resolve absolute paths so the Blob worker successfully locates the root assets
        const absCore = new URL(coreURL, window.location.href).href;
        const absWasm = new URL(wasmURL, window.location.href).href;

        const workerCode = `
            importScripts("${absCore}");
            onmessage = async (e) => {
                const { id, type, method, args } = e.data;
                if (type === "init") {
                    try {
                        self.FFmpegCore = await createFFmpegCore({
                            locateFile: (path) => path.endsWith(".wasm") ? "${absWasm}" : path,
                            print: (message) => postMessage({ type: "log", message }),
                            printErr: (message) => postMessage({ type: "log", message }),
                            onProgress: (progress) => postMessage({ type: "progress", progress })
                        });
                        postMessage({ id, type: "done" });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message });
                    }
                }
                if (type === "exec") {
                    try {
                        const ret = self.FFmpegCore.exec(...args);
                        postMessage({ id, type: "done", ret });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message });
                    }
                }
                if (type === "fs") {
                    try {
                        const ret = self.FFmpegCore.FS[method](...args);
                        postMessage({ id, type: "done", ret });
                    } catch (err) {
                        postMessage({ id, type: "error", error: err.message });
                    }
                }
            };
        `;

        const blob = new Blob([workerCode], { type: "text/javascript" });
        const blobURL = URL.createObjectURL(blob);
        this.worker = new Worker(blobURL);

        this.worker.onmessage = (e) => {
            const { id, type, message, progress, error, ret } = e.data;
            if (type === "log") this.emit("log", { message });
            if (type === "progress") this.emit("progress", { progress });
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
        return this.send("fs", "readFile", [path, args = { encoding }]);
    }

    async deleteFile(path) {
        return this.send("fs", "unlink", [path]);
    }

    async exec(args) {
        return this.send("exec", "", [args]);
    }

    terminate() {
        if (this.worker) this.worker.terminate();
        this.loaded = false;
    }
}
