const createMessageWithBinaryPayload = (m: any, binaryPayload?: Buffer | ArrayBuffer | undefined): Buffer | ArrayBuffer => {
    if (binaryPayload) {
        if (binaryPayload instanceof Buffer) {
            const mm = Buffer.concat([
                Buffer.from(JSON.stringify(m) + '\n', 'utf-8'),
                binaryPayload
            ])
            return mm
        }
        else if (binaryPayload instanceof ArrayBuffer) {
            const enc = new TextEncoder()
            const mm = concatArrayBuffers(
                enc.encode(JSON.stringify(m) + '\n'),
                binaryPayload
            )
            return mm
        }
    }
    else {
        return m
    }
}

function concatArrayBuffers(b1: ArrayBuffer, b2: ArrayBuffer) {
    const tmp = new Uint8Array(b1.byteLength + b2.byteLength)
    tmp.set(new Uint8Array(b1), 0)
    tmp.set(new Uint8Array(b2), b1.byteLength)
    return tmp.buffer

}

export default createMessageWithBinaryPayload