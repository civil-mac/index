// ffmpeg-util.js
export async function toBlobURL(url, mimeType) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

export async function fetchFile(file) {
    if (file instanceof File || file instanceof Blob) {
        return new Uint8Array(await file.arrayBuffer());
    }
    if (typeof file === 'string') {
        const resp = await fetch(file);
        return new Uint8Array(await resp.arrayBuffer());
    }
    throw new Error("Unsupported file type passed to fetchFile");
}
