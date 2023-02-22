import cors, { CorsOptions } from 'cors';
import express, { Express, Request, Response } from 'express';
import * as http from 'http';
import { Server as WSServer } from 'ws';
import { AcknowledgeMessageToService, isInitializeMessageFromService, isPingMessageFromService, isResponseToClient, RequestFromClient } from './ConnectorHttpProxyTypes';
import ServiceManager, { Service } from './ServiceManager';
import crypto from 'crypto'
import parseMessageWithBinaryPayload from './parseMessageWithBinaryPayload';
import createMessageWithBinaryPayload from './createMessageWithBinaryPayload';

if (!process.env.PROXY_SECRET) {
    throw Error(`Environment variable not set: PROXY_SECRET`)
}

const expressApp: Express = express()

// TODO: need to make this configurable
const allowedOrigins = ['https://figurl.org', 'https://flatironinstitute.github.io', 'https://scratchrealm.github.io', 'https://magland.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://localhost:3000']

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin)) {
            callback(null, origin)
        }
        else {
            callback(null, allowedOrigins[0])
        }
    }
}
expressApp.use(cors(corsOptions))

const expressServer = http.createServer(expressApp)

const port = process.env.PORT || 3035

expressApp.use(express.json())

const serviceManager = new ServiceManager()

expressApp.get('/probe', (req: Request, res: Response) => {
    res.send('running.')
})

expressApp.post('/s/:serviceId/api', (req: Request, res: Response) => {
    ;(async () => {
        const request = req.body
        const {serviceId} = req.params
        const service = serviceManager.getService(serviceId)
        if (!service) {
            res.status(404).send({message: `service not found: ${serviceId}`})
            return
        }
        
        const rr: RequestFromClient = {
            type: 'requestFromClient',
            requestId: randomAlphaString(10),
            request
        }
        service.handleRequestFromClient(rr)

        // let gotResponse = false
        // req.on('close', () => {
        //     if (!gotResponse) {
        //         service.cancelRequestFromClient(request.requestId)
        //     }
        // })

        const rsp = await service.waitForResponseToClient(rr.requestId, 5000)
        if (!rsp) {
            res.status(504).send({message: `timeout waiting for response`})
            return
        }
        if (rsp.response.error) {
            res.status(404).send(`error handling request ${request.type}: ${rsp.response.error}`)
            return
        }
        // gotResponse = true
        const mm = createMessageWithBinaryPayload(rsp.response.response, rsp.binaryPayload)
        res.send(mm)
    })().catch(err => {
        // internal server error
        res.status(500).send({message: err.message})
    })
})

const wss: WSServer = new WSServer({server: expressServer})
wss.on('connection', (ws) => {
    console.info('New websocket connection.')
    let initialized = false
    let serviceId = ''
    let service: Service | undefined = undefined
    ws.on('message', msg => {
        if (!((msg instanceof Buffer) || (msg instanceof ArrayBuffer))) {
            console.error(`Invalid type for message: ${serviceId}`)
            ws.close()
            return
        }
        const {message, binaryPayload} = parseMessageWithBinaryPayload(msg)
        if (isInitializeMessageFromService(message)) {
            if (initialized) {
                console.error(`Websocket already initialized: ${serviceId}`)
                ws.close()
                return
            }
            if (message.proxySecret !== process.env.PROXY_SECRET) {
                console.error(`${message.proxySecret} <> process.env.PROXY_SECRET`)
                console.error(`Incorrect proxy secret. Closing.`)
                ws.close()
                return
            }
            serviceId = message.serviceId
            const servicePrivateId = message.servicePrivateId
            if (sha1Hash(servicePrivateId).slice(0, 20) !== serviceId) {
                console.error(`Invalid private ID for service ID`)
                ws.close()
                return
            }
            if (serviceManager.hasService(serviceId)) {
                console.error(`Service already exists: ${serviceId}`)
                ws.close()
                return
            }
            initialized = true
            const handleRequestFromClient = (request: RequestFromClient) => {
                ws.send(JSON.stringify(request))
            }
            console.info(`SERVICE CONNECTED: ${serviceId}`)
            service = serviceManager.addService(serviceId, handleRequestFromClient)
            const acknowledgeMessage: AcknowledgeMessageToService = {
                type:'acknowledge'
            }
            ws.send(JSON.stringify(acknowledgeMessage))
            return
        }
        if (!initialized) {
            console.error('Expected initialize message from websocket. Closing.')
            ws.close()
            return
        }
        if (!service) {
            console.error('Unexpected, service is undefined. Closing.')
            ws.close()
            return
        }
        if (isResponseToClient(message)) {
            if (!message.requestId) {
                console.error(`No requestId in message from websocket. Closing ${serviceId}`)
                ws.close()
                return
            }
            service.handleResponseToClient(message, binaryPayload)
        }
        else if (isPingMessageFromService(message)) {
            // this is just to keep the connection alive
        }
        else {
            console.error(`Unexpected message from service. Closing ${serviceId}`)
            ws.close()
        }
    })
    ws.on('close', () => {
        if (serviceId) {
            if (serviceManager.hasService(serviceId)) {
                serviceManager.removeService(serviceId)
            }
            if (service) {
                service = undefined
            }
        }
    })
})

expressServer.listen(port, () => {
    return console.log(`[server]: Server is running on port ${port}`)
})

function sha1Hash(x: string) {
    const shasum = crypto.createHash('sha1')
    shasum.update(x)
    return shasum.digest('hex')
}

export const randomAlphaString = (num_chars: number) => {
    if (!num_chars) {
        /* istanbul ignore next */
        throw Error('randomAlphaString: num_chars needs to be a positive integer.')
    }
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < num_chars; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}