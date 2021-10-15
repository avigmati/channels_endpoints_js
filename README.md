# channels_endpoints
Client library for django [channels_endpoints](https://pypi.org/project/channels-endpoints/) python package

## Installation

```shell
npm install channels_endpoints
```

## Usage

```js
// config
const DCE_SOCKET_URL = 'ws://' + window.location.host + '/ws/'
const DCE_SOCKET_OPTIONS = {debug: false}  // reconnecting-websocket options see https://github.com/pladaria/reconnecting-websocket
const DCE_DEBUG = true  // if true log to console
const DCE_DEBUG_DATA_REQUEST = true  // log request data
const DCE_DEBUG_DATA_RESPONSE = true  // log response data


import {dce, dce_connection, consumer} from "channels_endpoints"


// simply get
dce('myapp.some_endpoint', {some: "data"}).then(
    response => {
        console.log(response)
    }
)

// filter console log
const log = (data) => {
    data.sensitive_data = '*****'
    return data
}

dce('myapp.some_endpoint', {1: 2, sensitive_data: "data"}, {log_data_filter: log}).then(
    response => {
        console.log(response)
    }
)

// push data no wait response
dce('myapp.some_endpoint', {some: "data"}, {push: true})

// cancelation
const token = {}  // cancellation token
const promise = dce('myapp.some_endpoint', {some: "data"}, {token: token})
promise.then(
    response => {},
    error => {
        if (error.error !== 'CancelledError') {
            throw error.error
        }
    }
)
token.cancel()

// use events
dce_connection.addEventListener("connected", () => {
        console.log('connected')
    }
)

dce_connection.addEventListener("disconnected", () => {
        console.log('disconnected')
    }
)

// use consumer
consumer('EventsConsumer', (response) => {
    console.log('EventsConsumer received: ', response)
})

```
