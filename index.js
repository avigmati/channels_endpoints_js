'use strict'

/**
 * django channels endpoints frontend app
 * @author avigmati@gmail.com
 */

import ReconnectingWebSocket from 'reconnecting-websocket'

const DceException = (error, data) => {
    this.error = error
    this.data = data
}

const debug = (typeof DCE_DEBUG !== 'undefined') ? DCE_DEBUG : false
const verbose = (typeof DCE_VERBOSE !== 'undefined') ? DCE_VERBOSE : false

let socket_url
if (typeof DCE_SOCKET_URL === 'undefined') {
    throw new DceException('DCE_SOCKET_URL undefined.', null)
} else {
    socket_url = DCE_SOCKET_URL
}

let promises = []  // dce calls

let socket = new ReconnectingWebSocket(socket_url, null,
    {
        debug: debug,
    }
)

let cmd_id = 0

/*
Socket callbacks
 */

const onopen = () => {
    console.log('Connection open')
    dce_connection.dispatchEvent(new Event('connected'))
}

const onclose = () => {
    console.log('Connection close')
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

    // service responses
    if (response.msg_type === 'service') {
        if (response.error) {
            throw new DceException(response.error, response.error_data)
        } else {
            if (debug){
                console.log(response.data)
            }
        }
    }

    // non service responses
    else {

        // rpc response, resolve promise
        if (response.cmd_id) {
            // get target promise
            let _promise = promises.filter(p => {
                if (p.cmd_id === response.cmd_id) return p
            })
            if (_promise.length) {
                let promise = _promise[0]

                // clear promises from found promise
                promises = promises.filter(p => {
                    if (p.cmd_id !== response.cmd_id) return p
                })

                let elapsed = new Date() - promise.created
                elapsed = Math.abs(elapsed / 1000)

                if (response.error) {
                    if (verbose) console.log(`<- [${promise.cmd_id}] ${promise.endpoint} ${elapsed} ${response.error}`)
                    promise.reject(new DceException(response.error, response.error_data))
                } else {
                    if (verbose) console.log(`<- [${promise.cmd_id}] ${promise.endpoint} ${elapsed}`)
                    promise.resolve(response.data)
                }
            }
        }

        // routes consumers messages
        else {
            if (!Array.isArray(response.consumers)) {
                throw new DceException('No consumers list in response.', null)
            }
            if (response.consumers.length === 0) {
                throw new DceException('Empty consumers list in response.', null)
            }
            else {
                for (let c of response.consumers) {
                    let consumer = get_consumer(c)
                    consumer(response)
                }
            }
        }

    }
}

socket.onopen = (event) => { onopen(event) }

socket.onclose = () => { onclose() }

socket.onmessage = (event) => { onmessage(event) }


const waitConnection = (func) => {
    /*
    Check connection every 0.5 second and call received function then done
     */

    if (socket.readyState === 1) { return func() }
    else {
        setTimeout(() => {
            waitConnection(func)
        }, 500)
    }
}

const dce = (endpoint, data, token, log_data_filter=null, push=false) => {
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
                let promise
                let _promise = promises.filter(p => {
                    if (p.cmd_id === _cmd_id) return p
                })
                if (_promise.length) {
                    promise = _promise[0]  // canceled promise

                    // clear promises from canceled
                    promises = promises.filter(p => {
                        if (p.cmd_id !== _cmd_id) return p
                    })

                    let elapsed = new Date() - promise.created
                    elapsed = Math.abs(elapsed / 1000)
                    if (verbose) console.log(`<- [${promise.cmd_id}] ${promise.endpoint} ${elapsed} CanceledError`)

                    // cancel request on backend
                    socket.send(JSON.stringify({endpoint: endpoint, cmd_id: _cmd_id, data: null, cancel: true}))
                    reject(new DceException('CancelledError', null))
                }
            }
            token.cmd_id = () => {
                return _cmd_id
            }
        }

        if (!push) {
            // if not push mode save promise
            promises.push({
                cmd_id: _cmd_id,
                resolve: resolve,
                reject: reject,
                endpoint: endpoint,
                token: token,
                created: new Date()
            })
        }

        if (log_data_filter) {
            if (push) {
                if (verbose) console.log(`-> [${_cmd_id}] [push] ${endpoint}`, log_data_filter(data))
            } else {
                if (verbose) console.log(`-> [${_cmd_id}] ${endpoint}`, log_data_filter(data))
            }
        } else {
            if (push) {
                if (verbose) console.log(`-> [${_cmd_id}] [push] ${endpoint}`, data)
            } else {
                if (verbose) console.log(`-> [${_cmd_id}] ${endpoint}`, data)
            }
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


const consumer = func => {
    if (typeof func !== 'function') {
        throw new DceException(`Registered consumer "${func}" must be a function.`, null)
    }
    registered_consumers[func.prototype.constructor.name] = func
}

const get_consumer = name => {
    if (!registered_consumers.hasOwnProperty(name)) {
      throw new DceException(`Consumer ${name} not found.`)
    }
    return registered_consumers[name]
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

const dce_connection = new dce_connected_event_target()


export {
    dce,
    consumer,
    dce_connection
}