import cors, { CorsOptions } from 'cors';
import express, { Express, Request, Response } from 'express';
import * as http from 'http';
import { Server as WSServer } from 'ws';
import { AcknowledgeMessageToService, isInitializeMessageFromService, isPingMessageFromService, isResponseToClient, RequestFromClient } from './ConnectorHttpProxyTypes';
import ServiceManager, { Service } from './ServiceManager';

if (!process.env.PROXY_SECRET) {
    throw Error(`Environment variable not set: PROXY_SECRET`)
}

const expressApp: Express = express()

const allowedOrigins = ['https://flatironinstitute.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173']
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

expressApp.post('/s/:serviceName/api', (req: Request, res: Response) => {
    ;(async () => {
        const request = req.body
        const {serviceName} = req.params
        const service = serviceManager.getService(serviceName)
        if (!service) {
            res.status(404).send({message: `service not found: ${serviceName}`})
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

        const response = await service.waitForResponseToClient(rr.requestId, 5000)
        if (!response) {
            res.status(504).send({message: `timeout waiting for response`})
            return
        }
        if (response.error) {
            res.status(404).send(`error handling request ${request.type}: ${response.error}`)
            return
        }
        // gotResponse = true
        res.send(response.response)
    })().catch(err => {
        // internal server error
        res.status(500).send({message: err.message})
    })
})

const wss: WSServer = new WSServer({server: expressServer})
wss.on('connection', (ws) => {
    console.info('New websocket connection.')
    let initialized = false
    let serviceName = ''
    let service: Service | undefined = undefined
    ws.on('message', msg => {
        const messageJson = msg.toString()
        let message: any
        try {
            message = JSON.parse(messageJson)
        }
        catch(err) {
            console.error(`Error parsing message. Closing ${serviceName}`)
            ws.close()
            return
        }
        if (isInitializeMessageFromService(message)) {
            if (initialized) {
                console.error(`Websocket already initialized: ${serviceName}`)
                ws.close()
                return
            }
            if (message.proxySecret !== process.env.PROXY_SECRET) {
                console.error(`Incorrect proxy secret. Closing.`)
                ws.close()
                return
            }
            initialized = true
            serviceName = message.serviceName
            if (serviceManager.hasService(serviceName)) {
                console.error(`Service already exists: ${serviceName}`)
                ws.close()
                return
            }
            const handleRequestFromClient = (request: RequestFromClient) => {
                ws.send(JSON.stringify(request))
            }
            console.info(`SERVICE CONNECTED: ${serviceName}`)
            service = serviceManager.addService(serviceName, handleRequestFromClient)
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
                console.error(`No requestId in message from websocket. Closing ${serviceName}`)
                ws.close()
                return
            }
            service.handleResponseToClient(message)
        }
        else if (isPingMessageFromService(message)) {
            // this is just to keep the connection alive
        }
        else {
            console.error(`Unexpected message from service. Closing ${serviceName}`)
            ws.close()
        }
    })
    ws.on('close', () => {
        if (serviceName) {
            if (serviceManager.hasService(serviceName)) {
                serviceManager.removeService(serviceName)
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