import { randomAlphaString } from ".";
import { RequestFromClient, ResponseToClient, ResponseToClientPart } from "./ConnectorHttpProxyTypes";

export class Service {
    #responseToClientCallbacks: {[id: string]: (response: ResponseToClient, binaryPayload: Buffer | ArrayBuffer | undefined) => void} = {}
    #responseToClientPartManager = new ResponseToClientPartManager()
    constructor(private onRequestFromClient: (req: RequestFromClient) => void) {

    }
    handleRequestFromClient(request: RequestFromClient) {
        this.onRequestFromClient(request)
    }
    handleResponseToClient(response: ResponseToClient, binaryPayload: Buffer | ArrayBuffer | undefined) {
        for (const id in this.#responseToClientCallbacks) {
            this.#responseToClientCallbacks[id](response, binaryPayload)
        }
    }
    handleResponseToClientPart(responsePart: ResponseToClientPart, binaryPayload: Buffer | ArrayBuffer | undefined) {
        const {completeResponse, completeBinaryPayload} = this.#responseToClientPartManager.handlePart(responsePart, binaryPayload)
        if (completeResponse) {
            this.handleResponseToClient(completeResponse, completeBinaryPayload)
        }
    }
    async waitForResponseToClient(requestId: string, timeoutMsec: number): Promise<{response: ResponseToClient, binaryPayload: Buffer | ArrayBuffer | undefined} | undefined> {
        return new Promise((resolve) => {
            let finished = false
            const deleteCallback = this._onResponseToClient((response, binaryPayload) => {
                if (response.requestId === requestId) {
                    if (!finished) {
                        finished = true
                        deleteCallback()
                        resolve({response, binaryPayload})
                    }
                }
            })
            setTimeout(() => {
                if (!finished) {
                    finished = true
                    deleteCallback()
                    resolve(undefined)
                }
            }, timeoutMsec)
        })
    }
    _onResponseToClient(callback: (response: ResponseToClient, binaryPayload: Buffer | ArrayBuffer | undefined) => void) {
        const id = randomAlphaString(10)
        this.#responseToClientCallbacks[id] = callback
        return () => {
            delete this.#responseToClientCallbacks[id]
        }
    }
}

class ServiceManager {
    services: {[serviceId: string]: Service} = {}
    getService(serviceId: string): Service | undefined {
        if (serviceId in this.services) {
            return this.services[serviceId]
        }
        else {
            return undefined
        }
    }
    hasService(serviceId: string) {
        return this.getService(serviceId) !== undefined
    }
    addService(serviceId: string, onRequestFromClient: (request: RequestFromClient) => void) {
        if (this.hasService(serviceId)) {
            throw Error('unexpected. service already exists.')
        }
        const r = new Service(onRequestFromClient)
        this.services[serviceId] = r
        return r
    }
    removeService(serviceId: string) {
        if (!this.hasService(serviceId)) {
            throw Error('unexpected. cannot remove service that does not exist.')
        }
        delete this.services[serviceId]
    }
}

class InProgressResponse {
    #parts: {[partIndex: number]: ResponseToClientPart} = {}
    #binaryPayloadParts: {[partIndex: number]: Buffer | ArrayBuffer} = {}
    #numParts: number = 0
    #numPartsReceived: number = 0
    timestampLastModified = Date.now()
    handlePart(responsePart: ResponseToClientPart, binaryPayload: Buffer | ArrayBuffer) {
        this.timestampLastModified = Date.now()
        this.#numParts = responsePart.numParts
        this.#parts[responsePart.partIndex] = responsePart
        this.#binaryPayloadParts[responsePart.partIndex] = binaryPayload
        this.#numPartsReceived++
        if (this.#numPartsReceived === this.#numParts) {
            if (!this.#parts[0]) {
                throw Error('unexpected. first part not received.')
            }
            const completeResponseMessage = this.#parts[0].response
            const completeResponse: ResponseToClient = {
                type: 'responseToClient',
                requestId: responsePart.requestId,
                response: completeResponseMessage,
                error: undefined
            }
            const completeBinaryPayload = this._getCompleteBinaryPayload()
            return {completeResponse, completeBinaryPayload}
        }
        else {
            return {completeResponse: undefined, completeBinaryPayload: undefined}
        }
    }
    _getCompleteBinaryPayload(): Buffer | ArrayBuffer {
        const uint8ArrayPartsList: Uint8Array[] = []
        for (let i = 0; i < this.#numParts; i++) {
            if (!(i in this.#binaryPayloadParts)) {
                throw Error('unexpected. missing binary payload part.')
            }
            const p = this.#binaryPayloadParts[i]
            uint8ArrayPartsList.push(new Uint8Array(p))
        }
        return Buffer.concat(uint8ArrayPartsList)
    }
}

class ResponseToClientPartManager {
    #inProgressResponses: {[requestId: string]: InProgressResponse} = {}
    handlePart(responsePart: ResponseToClientPart, binaryPayload: Buffer | ArrayBuffer | undefined) {
        if (!binaryPayload) {
            throw Error('unexpected. binaryPayload is undefined for response part.')
        }
        const {requestId} = responsePart
        if (!(requestId in this.#inProgressResponses)) {
            this.#inProgressResponses[requestId] = new InProgressResponse()
        }
        if (responsePart.error) {
            delete this.#inProgressResponses[requestId]
            this._cleanupOldResponsesInProgress()
            const completeResponse: ResponseToClient = {
                type: 'responseToClient',
                requestId: responsePart.requestId,
                response: undefined,
                error: responsePart.error
            }
            return {completeResponse, completeBinaryPayload: undefined}
        }
        const {completeResponse, completeBinaryPayload} = this.#inProgressResponses[requestId].handlePart(responsePart, binaryPayload)
        if (completeResponse) {
            delete this.#inProgressResponses[requestId]
            this._cleanupOldResponsesInProgress()
            return {completeResponse, completeBinaryPayload}
        }
        else {
            return {completeResponse: undefined, completeBinaryPayload: undefined}
        }
    }
    _cleanupOldResponsesInProgress() {
        const now = Date.now()
        for (const requestId in this.#inProgressResponses) {
            const inProgressResponse = this.#inProgressResponses[requestId]
            if (now - inProgressResponse.timestampLastModified > 1000 * 60) {
                delete this.#inProgressResponses[requestId]
            }
        }
    }
}

export default ServiceManager