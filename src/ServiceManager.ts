import { randomAlphaString } from ".";
import { RequestFromClient, ResponseToClient } from "./ConnectorHttpProxyTypes";

export class Service {
    #responseToClientCallbacks: {[id: string]: (response: ResponseToClient) => void} = {}
    constructor(private onRequestFromClient: (req: RequestFromClient) => void) {

    }
    handleRequestFromClient(request: RequestFromClient) {
        this.onRequestFromClient(request)
    }
    handleResponseToClient(response: ResponseToClient) {
        for (const id in this.#responseToClientCallbacks) {
            this.#responseToClientCallbacks[id](response)
        }
    }
    async waitForResponseToClient(requestId: string, timeoutMsec: number): Promise<ResponseToClient | undefined> {
        return new Promise((resolve) => {
            let finished = false
            const deleteCallback = this._onResponseToClient(response => {
                if (response.requestId === requestId) {
                    if (!finished) {
                        finished = true
                        deleteCallback()
                        resolve(response)
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
    _onResponseToClient(callback: (response: ResponseToClient) => void) {
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

export default ServiceManager