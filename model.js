(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['schema2js'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('./schema2js'));
	} else {
		// Browser globals
		global.JsonModel = factory(global.schema2js);
	}
})(this, function (schema2js) {
	var api = {};
	api.schema2js = schema2js;
	api.ErrorCodes = schema2js.ErrorCodes;

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
	api.EventEmitter = EventEmitter;
	
	var errorRequestFunction = function () {throw new Error('Requests not supported');};
	var suppliedRequestFunction = errorRequestFunction;
	function requestFunction(params, callback) {
		return suppliedRequestFunction(params, callback);
	}
	api.setRequestFunction = function (func) {
		suppliedRequestFunction = func || errorRequestFunction;
	};
	
	var schemaStore = api.schemaStore = new schema2js.SchemaStore();
	var generator = new schema2js.Generator({classes: false, assignment: true, schemaStore: schemaStore});
	var generatedClasses = generator.classes(null, requestFunction);
	api.validator = function (schema, callback) {
		callback = callback || function () {};
		var transform = function (validatorErrors) {
			return function (data) {
				var schemaMap = {};
				var errors = validatorErrors(data, "", schemaMap);
				return {valid: !errors.length, errors: errors, schemas: schemaMap};
			};
		};
		
		var result = transform(api.validationErrors(schema, function (error) {
			callback(error, result);
		}));
		return result;
	};
	api.validationErrors = function (schema, callback) {
		callback = callback || function () {};
		if (typeof schema === 'string') {
			if (generator.missing(schema)) {
				generator.addSchema(schema);
			}
			var name = generator.classNameForUrl(schema);
			var validator = function (data, dataPath, schemaMap) {
				if (generatedClasses[name]) {
					return generatedClasses[name].validationErrors(data, dataPath, schemaMap);
				} else {
					return [];
				}
			};
			whenSchemasFetched(function () {
				callback(null, validator);
			});
			return validator;
		} else {
			var anonymousGen = new schema2js.Generator({classes: false, assignment: true});
			var className = 'AnonymousSchema';
			anonymousGen.addSchema(schema, className);
			var classes = anonymousGen.classes();
			var validator = classes[className].validationErrors;

			var missing = anonymousGen.missing();
			// Make sure the main generator will have/fetch all the appropriate schemas
			missing.forEach(function (url) {
				if (generator.missing(url)) {
					generator.addSchema(url);
				}
			});
			
			// This block goes first, because if we actually have all the schemas already, it might trigger a sychronous regeneration
			whenSchemasFetched(function () {
				missing.forEach(function (url) {
					var className = generator.classNameForUrl(url);
					classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
				});
				callback(null, validator);
			});
			missing.forEach(function (url) {
				var className = generator.classNameForUrl(url);
				if (generatedClasses[className]) {
					classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
				}
			});
			return validator;
		}
	};
	
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
		var errors = [];
		var pendingSchemaFetch = false;
		
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
			
			// Recalculate schemas (from scratch for now - TODO: we'll improve this later!)
			var oldSchemaMap = schemaMap;
			schemaMap = {};
			errors = [];
			for (var i = 0; i < validatorFunctions.length; i++) {
				errors = errors.concat(validatorFunctions[i](value, "", schemaMap));
			}
			
			// Trigger events
			function checkSchemaChanges(path, modelSet, ignoreKey, oldSchemaMap) {
				var oldSchemas = oldSchemaMap[path] || [];
				var newSchemas = schemaMap[path] || [];
				var added = [], removed = [];
				for (var i = 0; i < oldSchemas.length; i++) {
					if (newSchemas.indexOf(oldSchemas[i]) === -1) {
						removed.push(oldSchemas[i]);
					}
				}
				for (var i = 0; i < newSchemas.length; i++) {
					var schemaUrl = newSchemas[i];
					if (oldSchemas.indexOf(schemaUrl) === -1) {
						added.push(schemaUrl);
					}
				}
				if (added.length || removed.length) {
					if (modelSet.m) {
						modelSet.m.emit('schemachange', added, removed);
					}
					for (var key in modelSet.c) {
						if (ignoreKey === null || key !== ignoreKey) {
							checkSchemaChanges(path + "/" + pointerEscape(key), modelSet.c[key], null, oldSchemaMap);
						}
					}
				}
			}
			
			// TODO: emit relative JSON Pointer for parent changes?
			function childValueChanges(modelSet) {
				for (var key in modelSet.c) {
					var childModelSet = modelSet.c[key];
					if (childModelSet.m) {
						childModelSet.m.emit('change', '');
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
				checkSchemaChanges(partialPath, modelSet, nextKey, oldSchemaMap);
				if (modelSet.m) {
					modelSet.m.emit('change', path.substring(partialPath.length));
				}
				if (nextKey !== null) {
					modelSet = modelSet.c[nextKey];
					if (!modelSet) break;
				} else {
					// End of the queue, so iterate into children
					childValueChanges(modelSet);
				}
			}
			
			if (!pendingSchemaFetch && !api.schemasFetched()) {
				pendingSchemaFetch = true;
				api.whenSchemasFetched(function () {
					pendingSchemaFetch = false;
					// Recalculate schemas (from scratch for now - TODO: we'll improve this later!)
					var oldSchemaMap = schemaMap;
					schemaMap = {};
					errors = [];
					for (var i = 0; i < validatorFunctions.length; i++) {
						errors = errors.concat(validatorFunctions[i](value, "", schemaMap));
					}
					checkSchemaChanges('', models, null, oldSchemaMap);
				});
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
		this.getPathErrors = function (path, includeSchemas) {
			path = path || "";
			var result = errors.filter(function (error) {
				return error.path == path
					|| (error.path.substring(0, path.length) == path
						&& error.path.charAt(path.length) == '/');
			});
			if (includeSchemas) {
				for (var dataPath in schemaMap) {
					if (dataPath == path
						|| (dataPath.substring(0, path.length) == path
							&& dataPath.charAt(path.length) == '/')) {
						var schemaBases = {};
						schemaMap[dataPath].forEach(function (schemaUrl) {
							var baseUrl = schemaUrl.replace(/#.*/, '');
							schemaBases[baseUrl] = true;
						});
						for (var schemaUrl in schemaBases) {
							if (requestErrors[schemaUrl]) {
								result.push({
									code: schema2js.ErrorCodes.SCHEMA_FETCH_ERROR,
									path: dataPath,
									params: {url: schemaUrl, error: requestErrors[schemaUrl].message}
								});
							}
						}
					}
				}
			}
			return result;
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
		pointer: function () {
			return this._path;
		},
		length: function (pathSpec) {
			var value = this.get(pathSpec);
			if (Array.isArray(value)) return value.length;
			return 0;
		},
		item: function (index) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(index + ''));
		},
		items: function (callback) {
			var length = this.length();
			for (var i = 0; i < length; i++) {
				callback(this.item(i), i);
			}
			return this;
		},
		keys: function (pathSpec) {
			var value = this.get(pathSpec);
			if (!value || Array.isArray(value) || typeof value !== 'object') return [];
			return Object.keys(value);
		},
		prop: function (key) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
		},
		props: function (callback) {
			var keys = this.keys();
			for (var i = 0; i < keys.length; i++) {
				callback(this.prop(keys[i]), keys[i]);
			}
			return this;
		},
		schemas: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathSchemas(this._path + pathSpec);
		},
		errors: function (pathSpec, includeSchemaFetchErrors) {
			if (pathSpec === true || pathSpec === false) {
				includeSchemaFetchErrors = pathSpec;
				pathSpec = "";
			} else if (pathSpec == null) {
				pathSpec = "";
			}
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathErrors(this._path + pathSpec, includeSchemaFetchErrors);
		},
		jsonType: function (pathSpec) {
			var value = this.get(pathSpec);
			if (value === undefined) return 'undefined';
			if (value === null) return 'null';
			if (Array.isArray(value)) return 'array';
			return typeof value;
		},
		toJSON: function () {
			return this.get();
		}
	};
	EventEmitter.addMethods(Model.prototype);
	
	var pendingRequests = {};
	var requestErrors = {};
	var whenAllSchemasFetchedCallbacks = [];
	function checkSchemasFetched(skipCallbacks) {
		if (generator.schemaStore.missing().length === 0) {
			generatedClasses = generator.classes(null, requestFunction);
			while (!skipCallbacks && whenAllSchemasFetchedCallbacks.length) {
				var callback = whenAllSchemasFetchedCallbacks.shift();
				callback();
			}
		}
	}
	api.schemasFetched = function () {
		return !generator.missing().length;
	};
	var whenSchemasFetched = api.whenSchemasFetched = function whenSchemasFetched(callback) {
		whenAllSchemasFetchedCallbacks.push(callback);
		schemaStore.missing().forEach(function (missingUrl) {
			generator.addSchema(missingUrl);
		
			if (pendingRequests[missingUrl]) return;
			pendingRequests[missingUrl] = true;
			requestFunction({method: 'GET', url: missingUrl}, function (error, data) {
				if (error) {
					if (typeof console !== 'undefined' && console.error) console.error(error);
					requestErrors[missingUrl] = error;
				}
				pendingRequests[missingUrl] = false;
				generator.addSchema(missingUrl, data || {});
				checkSchemasFetched();
			});
		});
		// We might have all the schemas anyway, but need a refresh, so regenerate the schemas only
		checkSchemasFetched(true);
		setTimeout(checkSchemasFetched, 10);
	}
	
	api.open = function (params, hintSchemas, callback) {
		if (typeof params === 'string') {
			params = {url: params};
		}
		if (typeof hintSchemas === 'function') {
			callback = hintSchemas;
			hintSchemas = null;
		}
		params.method = params.method || 'GET';
		requestFunction(params, function (error, data, headers) {
			if (error) return callback(error);
			return api.create(data, params.url, hintSchemas, callback);
		});
	};
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
		if (typeof schemas === 'string' || (typeof schemas === 'object' && !Array.isArray(schemas))) schemas = [schemas];
		schemas = schemas || [];

		var validatorFunctions = schemas.map(function (schema) {
			return api.validationErrors(schema);
		});

		var rootModel = new RootModel(initialValue, validatorFunctions);
		var result = rootModel.modelForPath('');
		if (callback) {
			whenSchemasFetched(function () {
				callback(null, result);
			});
		}
		return result;
	};
	api.extend = function (obj) {
		Object.keys(obj).forEach(function (key) {
			Model.prototype[key] = obj[key];
		});
	};
	api.is = function (potentialModel) {
		return potentialModel instanceof Model;
	};
	
	return api;
});