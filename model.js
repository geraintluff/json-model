(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['schema2js'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('./index'));
	} else {
		// Browser globals
		global.DataModel = factory(global.schema2js);
	}
})(this, function (schema2js) {

	function pointerEscape(key) {
		return key.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	function pointerUnescape(key) {
		return key.replace(/~1/g, "/").replace(/~0/g, "~");
	}

	// Quick+dirty EventEmitter class
	function EventEmitter() {
	}
	EventEmitter.prototype = {
		on: function (event, listener) {
			this._events = this._events || {};
			this._events[event] = this._events[event] || [];
			this._events[event].push(listener);
			this.emit('newListener', event, listener);
			return this;
		},
		once: function (event, listener) {
			var selfRemovingListener = function () {
				this.off(event, selfRemovingListener);
				listener.apply(this, arguments);
			};
			return this.on(event, selfRemovingListener);
		},
		off: function (event, listener) {
			if (!listener) {
				if (!event) {
					for (event in this._events || {}) {
						this.off(event);
					}
				} else {
					var listeners = (this._events && this._events[event]) || [];
					while (listeners.length) {
						this.emit('removeListener', event, listeners.shift());
					}
					this._events[event] = [];
				}
			} else if (event) {
				this._events = this._events || {};
				this._events[event] = this._events[event] || [];
				var index = this._events[event].indexOf(listener);
				if (index !== -1) {
					this._events[event].splice(index, 1);
				}
				this.emit('removeListener', event, listener);
			}
			return this;
		},
		removeListener: function (event, listener) {
			if (typeof listener !== 'function') throw new Error('Listener must be function');
			return this.off(event, listener);
		},
		emit: function (event) {
			var args = Array.prototype.slice.call(arguments, 1);
			if (this._events && this._events[event]) {
				var listeners = this._events[event].slice();
				while (listeners.length) {
					var listener = listeners.shift();
					listener.apply(this, args);
				}
				return true;
			}
			return false;
		}
	};
	EventEmitter.prototype.addListener = EventEmitter.prototype.on;
	EventEmitter.prototype.removeAllListeners = EventEmitter.prototype.off;
	EventEmitter.addMethods = function (obj) {
		for (var key in EventEmitter.prototype) {
			obj[key] = EventEmitter.prototype[key];
		}
		return obj;
	};
	
	var api = {};
	
	function requestFunction(params, callback) {
		throw new Error('Requests not supported');
	}
	
	var generator = api.generator = new schema2js.Generator({model: false, assignment: true});
	var generatedClasses = generator.classes(null, requestFunction);
	api.tv4 = generator.tv4;
	api.EventEmitter = EventEmitter;
	
	api.requestFunction = null;
	
	function resolvePointer(path, valueTarget) {
		var pathParts = path.split('/').slice(1).map(pointerUnescape);
		var finalKey = pathParts.pop();
		for (var i = 0; i < pathParts.length; i++) {
			var key = pathParts[i];
			if (valueTarget && typeof valueTarget === 'object') {
				valueTarget = valueTarget[key];
			} else {
				finalKey = null;
				break;
			}
		}
		return {target: valueTarget, key: finalKey};
	}

	function RootModel(initialValue, validatorFunctions) {
		var value;
		var schemaMap = {};
		
		var models = {c: {}};
		this.modelForPath = function (path) {
			var pathParts = path.split('/').slice(1).map(pointerUnescape);
			var target = models;
			for (var i = 0; i < pathParts.length; i++) {
				var key = pathParts[i];
				target = target.c[key] = target.c[key] || {c: {}};
			}
			return target.m = target.m || new Model(this, path);
		}
		
		this.setPathValue = function (path, newValue) {
			if (!path) {
				value = newValue;
			} else {
				var resolved = resolvePointer(path, value);
				if (resolved.target && typeof resolved.target === 'object') {
					if (resolved.target[resolved.key] === newValue) {
						return true;
					} else if (typeof newValue === 'undefined') {
						delete resolved.target[resolved.key];
					} else {
						resolved.target[resolved.key] = newValue;
					}
				} else {
					return false;
				}
			}
			
			// Recalculate schemas (from scratch for now - we'll recalculate later!)
			var oldSchemaMap = schemaMap;
			schemaMap = {};
			for (var i = 0; i < validatorFunctions.length; i++) {
				validatorFunctions[i](value, "", schemaMap);
			}
			
			// Trigger events
			function checkSchemaChanges(path, modelSet, ignoreKey) {
				var oldSchemas = oldSchemaMap[path] || [];
				var newSchemas = schemaMap[path] || [];
				var added = [], removed = [];
				for (var i = 0; i < oldSchemas.length; i++) {
					if (newSchemas.indexOf(oldSchemas[i]) === -1) {
						removed.push(oldSchemas[i]);
					}
				}
				for (var i = 0; i < newSchemas.length; i++) {
					if (oldSchemas.indexOf(newSchemas[i]) === -1) {
						added.push(newSchemas[i]);
					}
				}
				if (added.length || removed.length) {
					if (modelSet.m) {
						modelSet.m.emit('schemachange', added, removed);
					}
					for (var key in modelSet.c) {
						if (ignoreKey === null || key !== ignoreKey) {
							checkSchemaChanges(path + "/" + pointerEscape(key), modelSet.c[key], null);
						}
					}
				}
			}
			
			// TODO: emit relative JSON Pointer for parent changes?
			function childValueChanges(modelSet) {
				for (var key in modelSet.c) {
					var childModelSet = modelSet.c[key];
					if (childModelSet.m) {
						childModelSet.m.emit('change', '', childModelSet.m.get());
					}
					childValueChanges(childModelSet)
				}
			}
			
			var pathParts = path.split('/');
			var modelSet = models;
			for (var i = 1; i <= pathParts.length; i++) {
				var partialPath = pathParts.slice(0, i).join('/');
				var nextKey = null;
				if (partialPath !== path) {
					nextKey = pointerUnescape(pathParts[i]);
				}
				checkSchemaChanges(partialPath, modelSet, nextKey);
				if (modelSet.m) {
					modelSet.m.emit('change', path.substring(partialPath.length), newValue);
				}
				if (nextKey !== null) {
					modelSet = modelSet.c[nextKey];
					if (!modelSet) break;
				} else {
					// End of the queue, so iterate into children
					childValueChanges(modelSet);
				}
			}
			return true;
		};
		this.getPathValue = function (path) {
			if (!path) {
				return value;
			}
			var resolved = resolvePointer(path, value);
			if (resolved.target && typeof resolved.target === 'object') {
				return resolved.target[resolved.key];
			} else {
				return undefined;
			}
		};
		this.getPathSchemas = function (path) {
			return (schemaMap[path] || []).slice(0);
		};

		this.setPathValue("", initialValue);
	}
	RootModel.prototype = {
	};
	
	function Model(rootModel, path) {
		this._root = rootModel;
		this._path = path;
	}
	Model.prototype = {
		get: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathValue(this._path + pathSpec);
		},
		set: function (pathSpec, value) {
			if (arguments.length < 2) {
				value = pathSpec;
				pathSpec = "";
			}
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.setPathValue(this._path + pathSpec, value);
		},
		path: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.modelForPath(this._path + pathSpec);
		},
		length: function (pathSpec) {
			var value = this.get(pathSpec);
			if (Array.isArray(value)) return value.length;
			return 0;
		},
		item: function (index) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(index + ''));
		},
		keys: function (pathSpec) {
			var value = this.get(pathSpec);
			if (!value || Array.isArray(value) || typeof value !== 'object') return [];
			return Object.keys(value);
		},
		prop: function (key) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
		},
		schemas: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathSchemas(this._path + pathSpec);
		}
	};
	EventEmitter.addMethods(Model.prototype);
	
	api.create = function (initialValue, url, schemas, callback) {
		if (Array.isArray(url)) {
			callback = schemas;
			schemas = url;
			url = null;
		}
		if (typeof url === 'function') {
			callback = url;
			url = schemas = null;
		} else if (typeof schemas === 'function') {
			callback = schemas;
			schemas = null;
		}
		var validatorFunctions = [];
		var shouldRegenerate = false;
		if (typeof schemas === 'string') schemas = [schemas];
		(schemas || []).forEach(function (schemaUrl) {
			generator.addSchema(schemaUrl);
			var name = generator.classNameForUrl(schemaUrl);
			validatorFunctions.push(function (data, dataPath, schemaMap) {
				return generatedClasses[name].validationErrors(data, dataPath, schemaMap);
			});
			if (!generatedClasses[name]) {
				shouldRegenerate = true;
			}
		});
		if (shouldRegenerate) {
			generatedClasses = generator.classes(null, requestFunction);
		}
		
		var rootModel = new RootModel(initialValue, validatorFunctions);
		var result = rootModel.modelForPath('');
		if (callback) {
			callback(null, result);
		}
		return result;
	};
	
	return api;
});