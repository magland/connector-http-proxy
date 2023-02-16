const parseMessageWithBinaryPayload = (m: Buffer | ArrayBuffer | string): {message: any, binaryPayload?: Buffer | ArrayBuffer | undefined} => {
    if (m instanceof Buffer) {
        const ii = m.indexOf('\n')
        if (ii >= 0) {
            const message = JSON.parse(m.subarray(0, ii).toString('utf-8'))
            const binaryPayload = m.subarray(ii + 1)
            return {message, binaryPayload}
        }
        else {
            return {message: JSON.parse(m.toString('utf-8'))}
        }
    }
    else if (m instanceof ArrayBuffer) {
        const view = new Uint8Array(m)
        const ii = view.indexOf('\n'.charCodeAt(0))
        if (ii >= 0) {
            const dec = new TextDecoder('utf-8')
            const message = JSON.parse(dec.decode(m.slice(0, ii)))
            const binaryPayload = m.slice(ii + 1)
            return {message, binaryPayload}
        }
        else {
            const dec = new TextDecoder('utf-8')
            return {message: JSON.parse(dec.decode(m))}
        }
    }
    else {
        return {
            message: JSON.parse(m)
        }
    }
}

export default parseMessageWithBinaryPayload