'use strict';
/**
 * shared/ioRef.js
 *
 * Referência singleton ao servidor Socket.IO global.
 * Definida em server.js e lida por módulos que precisam
 * acessar namespaces arbitrários (ex: panel/panel.js).
 */
let _io = null;

module.exports = {
    set(io) { _io = io; },
    get()    { return _io; },
};
