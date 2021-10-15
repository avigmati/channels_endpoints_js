'use strict'

/**
 * django channels_endpoints app client library
 * @author Dmitry Novikov avigmati@gmail.com
 */

import ReconnectingWebSocket from 'reconnecting-websocket'
import cloneDeep from 'lodash.clonedeep'


// dce setup
let promises = {}  // dce calls
let cmd_id = 0  // dce calls counter (rpc)

export function DceException(error, data) {
    this.error = error
    this.data = data
}

// logging setup
const debug = (typeof DCE_DEBUG !== 'undefined') ? DCE_DEBUG : false
const debug_data_request = (typeof DCE_DEBUG_DATA_REQUEST !== 'undefined') ? DCE_DEBUG_DATA_REQUEST : false
const debug_data_response = (typeof DCE_DEBUG_DATA_RESPONSE !== 'undefined') ? DCE_DEBUG_DATA_RESPONSE : false

const log = (log_str, log_data=null) => {
    log_str = `[dce] ${log_str}`
    if (debug) {
        if (debug_data_request && log_data) {
            console.log(log_str, log_data)
        } else {
            console.log(log_str)
        }
    }
}

// socket setup
let socket_url
if (typeof DCE_SOCKET_URL === 'undefined') {
    throw new DceException('DCE_SOCKET_URL undefined.', null)
} else {
    socket_url = DCE_SOCKET_URL
}

let options = {debug: debug}
if (typeof DCE_SOCKET_OPTIONS !== 'undefined') {
    options = DCE_SOCKET_OPTIONS
}

let socket = new ReconnectingWebSocket(socket_url, null, options)


/*
Socket callbacks
 */

const onopen = () => {
    log('Connection open')
    dce_connection.dispatchEvent(new Event('connected'))
}

const onclose = () => {
    log('Connection close')
    dce_connection.dispatchEvent(new Event('disconnected'))
}

const onmessage = (event) => {
    /*
    Routes incoming messages. Resolves target promise or call registered consumer.
    */

    // parse response
    let response = {}
    try {
        response = JSON.parse(event.data)
    } catch(e) {
        throw new DceException('Response parse json error: ' + e, null)
    }

    // service response
    if (response.msg_type === 'service') {
        if (response.error) {
            throw new DceException(response.error, response.error_data)
        } else {
            log('service:', response.data)
        }
    }

    // non service responses
    else {

        // rpc response, resolve promise
        if (response.cmd_id) {
            // get target promise
            let promise = promises[response.cmd_id]

            if (promise) {
                let elapsed = new Date() - promise.created
                elapsed = Math.abs(elapsed / 1000)

                if (response.error) {
                    log(`<- [${response.cmd_id}] ${promise.endpoint} ${elapsed} ${response.error}`)
                    promise.reject(new DceException(response.error, response.error_data))
                } else {
                    const log_str = `<- [${response.cmd_id}] ${promise.endpoint} ${elapsed}`
                    if (debug_data_response) {
                        log(log_str, response.data)
                    } else {
                        log(log_str)
                    }
                    promise.resolve(response.data)
                }

                // clear promises from found promise
                delete promises[response.cmd_id]
            }
        }

        // routes consumers messages
        else {
            for (let c of response.consumers) {
                let consumer = get_consumer(c)

                const log_str = `<- [${c}]`
                if (debug_data_response) {
                    log(log_str, response.data)
                } else {
                    log(log_str)
                }

                consumer(response.data)
            }
        }
    }
}

socket.onopen = (event) => { onopen(event) }

socket.onclose = () => { onclose() }

socket.onmessage = (event) => { onmessage(event) }


const waitConnection = (func) => {
    /*
    Check connection every 0.1 second and call received function then done
     */

    if (socket.readyState === 1) { return func() }
    else {
        setTimeout(() => {
            waitConnection(func)
        }, 100)
    }
}

export const dce = (endpoint, data, {push=false, token=null, log_data_filter=null} = {}) => {
    /*
    Promises factory and sender
    */

    return new Promise(function(resolve, reject){
        // init
        cmd_id++
        const _cmd_id = cmd_id

        // cancellation via external token
        if (token) {
            token.cancel = () => {
                // get canceled promise
                let promise = promises[_cmd_id]

                if (promise) {
                    let elapsed = new Date() - promise.created
                    elapsed = Math.abs(elapsed / 1000)
                    log(`<- [${_cmd_id}] ${promise.endpoint} ${elapsed} CanceledError`)

                    // cancel request on backend
                    socket.send(JSON.stringify({endpoint: endpoint, cmd_id: _cmd_id, data: null, cancel: true}))
                    reject(new DceException('CancelledError', null))

                    // clear promises from canceled
                    delete promises[_cmd_id]
                }
            }
            token.cmd_id = () => {
                return _cmd_id
            }
        }

        // if not push mode save promise
        if (!push) {
            promises[_cmd_id] = {
                resolve: resolve,
                reject: reject,
                endpoint: endpoint,
                token: token,
                created: new Date()
            }
        }

        // log
        let log_data
        if (log_data_filter) {
            log_data = log_data_filter(cloneDeep(data))  // shallow copy data object for filter data mutation
        } else {
            log_data = data
        }
        if (push) {
            log(`-> [${_cmd_id}] [push] ${endpoint}`, log_data)
        } else {
            log(`-> [${_cmd_id}] ${endpoint}`, log_data)
        }

        // wait connection & send
        waitConnection (()=> {
            socket.send(JSON.stringify({endpoint: endpoint, cmd_id: _cmd_id, data: data}))
        })
    })
}

/*
Consumers
 */

let registered_consumers = {}


export const consumer = (name, func) => {
    if (typeof func !== 'function') {
        throw new DceException(`Registered consumer "${name}" must be a function.`, null)
    }
    registered_consumers[name] = func
}

const get_consumer = name => {
    let consumer = registered_consumers[name]
    if (!consumer) {
      throw new DceException(`Consumer ${name} not found.`)
    }
    return consumer
}

/*
Connection event

usage:
    import { dce_connection } from './dce'

    dce_connection.addEventListener("connected", () => {
            console.log("connected")
        }
    )
    dce_connection.addEventListener("disconnected", () => {
            console.log("disconnected")
        }
    )
*/

let dce_connected_event_target = function(options) {
    // Create a DOM EventTarget object
    let target = document.createTextNode(null)

    // Pass EventTarget interface calls to DOM EventTarget object
    this.addEventListener = target.addEventListener.bind(target)
    this.removeEventListener = target.removeEventListener.bind(target)
    this.dispatchEvent = target.dispatchEvent.bind(target)
}

export const dce_connection = new dce_connected_event_target()
