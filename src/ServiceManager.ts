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
    services: {[serviceName: string]: Service} = {}
    getService(serviceName: string): Service | undefined {
        if (serviceName in this.services) {
            return this.services[serviceName]
        }
        else {
            return undefined
        }
    }
    hasService(serviceName: string) {
        return this.getService(serviceName) !== undefined
    }
    addService(serviceName: string, onRequestFromClient: (request: RequestFromClient) => void) {
        if (this.hasService(serviceName)) {
            throw Error('unexpected. service already exists.')
        }
        const r = new Service(onRequestFromClient)
        this.services[serviceName] = r
        return r
    }
    removeService(serviceName: string) {
        if (!this.hasService(serviceName)) {
            throw Error('unexpected. cannot remove service that does not exist.')
        }
        delete this.services[serviceName]
    }
}

export default ServiceManager