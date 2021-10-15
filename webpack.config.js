const path = require('path')

module.exports = {
    target: 'web',
    entry: {
        index: './channels_endpoints.js',
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: 'channels_endpoints.js',
        library: 'channels_endpoints',
        libraryTarget: 'umd',
        globalObject: 'this',
        umdNamedDefine: true
    }
}