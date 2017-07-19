/*!
 * memorystore
 * Copyright(c) 2017 Rocco Musolino <@roccomuso>
 * MIT Licensed
 */

var debug = require('debug')('memorystore')
var LRU = require('lru-cache')
var util = require('util')

/**
 * One day in milliseconds.
 */

var oneDay = 3600000

function getTTL (options, sess, sid) {
  if (typeof options.ttl === 'number') return options.ttl
  if (typeof options.ttl === 'function') return options.ttl(options, sess, sid)
  if (options.ttl) throw new TypeError('`options.ttl` must be a number or function.')

  var maxAge = sess.cookie.maxAge
  return (typeof maxAge === 'number'
    ? Math.floor(maxAge)
    : oneDay)
}

var defer = typeof setImmediate === 'function'
  ? setImmediate
  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }

/**
 * Return the `MemoryStore` extending `express`'s session Store.
 *
 * @param {object} express session
 * @return {Function}
 * @api public
 */

module.exports = function (session) {
  /**
   * Express's session Store.
   */

  var Store = session.Store

  /**
   * Initialize MemoryStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function MemoryStore (options) {
    if (!(this instanceof MemoryStore)) {
      throw new TypeError('Cannot call MemoryStore constructor as a function')
    }

    options = options || {}
    Store.call(this, options)

    var self = this

    this.options = options || {}
    this.options.checkPeriod = options.checkPeriod || oneDay
    this.options.max = options.max || Infinity
    this.options.ttl = options.ttl

    this.store = LRU(this.options)
    debug('Init MemoryStore')

    this._checkInterval = setInterval(function () {
      debug('Pruning old entries')
      self.store.prune() // iterates over the entire cache proactively pruning old entries
    }, this.options.checkPeriod)
  }

  /**
   * Inherit from `Store`.
   */

  util.inherits(MemoryStore, Store)

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.get = function (sid, fn) {
    var store = this.store

    debug('GET "%s"', sid)

    var data = store.get(sid)
    debug('GOT %s', data)
    fn && defer(fn, null, data)
  }

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.set = function (sid, sess, fn) {
    var store = this.store

    var ttl = getTTL(this.options, sess, sid)
    store.set(sid, sess, ttl)
    debug('SET "%s" %s ttl:%s', sid, sess, ttl)
    fn && defer(fn, null)
  }

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @api public
   */

  MemoryStore.prototype.destroy = function (sid, fn) {
    var store = this.store

    if (Array.isArray(sid)) {
      sid.forEach(function (s) {
        debug('DEL "%s"', s)
        store.del(s)
      })
    } else {
      debug('DEL "%s"', sid)
      store.del(sid)
    }
    fn && defer(fn, null)
  }

  /**
   * Refresh the time-to-live for the session with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.touch = function (sid, sess, fn) {
    var store = this.store

    var ttl = getTTL(store, sess, sid)

    debug('EXPIRE "%s" ttl:%s', sid, ttl)
    store.set(sid, sess, ttl)
    fn && defer(fn, null)
  }

  /**
   * Fetch all sessions' ids
   *
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.ids = function (fn) {
    var store = this.store

    var Ids = store.keys()
    debug('Getting IDs: %s', Ids)
    fn && defer(fn, null, Ids)
  }

  /**
   * Fetch all sessions
   *
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.all = function (fn) {
    var store = this.store

    debug('Fetching all sessions')
    var result = []
    store.forEach(function (val, key) {
      val.id = key
      result.push(val)
    })
    fn && defer(fn, null, result)
  }

  /**
   * Delete all sessions from the store
   *
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.clear = function (fn) {
    var store = this.store

    store.reset()
    fn && defer(fn, null)
  }

  /**
   * Get the count of all sessions in the store
   *
   * @param {Function} fn
   * @api public
   */

  MemoryStore.prototype.length = function (fn) {
    var store = this.store

    fn && defer(fn, null, store.itemCount)
  }

  return MemoryStore
}