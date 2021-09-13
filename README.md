# channels_endpoints_js
Client library for django [channels_endpoints](https://pypi.org/project/channels-endpoints/) python package

## Installation

```shell
npm install channels_endpoints
```

## Usage

```js
import {dce, dce_connection, consumer} from "channels_endpoints"

dce('myapp.some_endpoint', {some: "data"}).then(
    response => {
        console.log(response)
    }
)

dce_connection.addEventListener("connected", () => {
        console.log('connected')
    }
)

dce_connection.addEventListener("disconnected", () => {
        console.log('disconnected')
    }
)

consumer('EventsConsumer', (response) => {
    console.log('EventsConsumer received: ', response.data)
})

```
