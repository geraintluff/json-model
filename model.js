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
	var ErrorCodes = api.ErrorCodes = schema2js.ErrorCodes;

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
	
	var errorRequestFunction = function (params) {throw new Error('Requests not enabled - try JsonModel.setRequestFunctionfunc):\n' + JSON.stringify(params));};
	var suppliedRequestFunction = errorRequestFunction;
	function requestFunction(params, callback) {
		return suppliedRequestFunction(params, callback);
	}
	api.setRequestFunction = function (func) {
		suppliedRequestFunction = func || errorRequestFunction;
	};
	
	var schemaStore, generator, generatedClasses;
	var generatorConfig = {classes: false, assignment: true, trackMissing: true, schemaStore: schemaStore};
	var clean = api.clean = function setupClean(callback) {
		if (callback) {
			// If possible, delay cleaning until schemas fetched
			return whenSchemasFetched(function () {
				clean();
				callback();
			});
		}
		requestErrors = {};
		pendingRequests = {};
		var config = Object.create(generatorConfig);
		config.schemaStore = schemaStore = api.schemaStore = new schema2js.SchemaStore();
		generator = new schema2js.Generator(config);
		generatedClasses = generator.classes(null, requestFunction);
		api.setRequestFunction(null);
	};
	clean();
	
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
			var validator = function (data, dataPath, schemaMap, missingMap) {
				if (generatedClasses[name]) {
					return generatedClasses[name].validationErrors(data, dataPath, schemaMap, missingMap);
				} else {
					if (schemaMap) {
						schemaMap[''] = schemaMap[''] || [];
						schemaMap[''].push(schema);
					}
					if (missingMap) {
						missingMap[''] = missingMap[''] || [];
						missingMap[''].push(schema);
					}
					return [];
				}
			};
			whenSchemasFetched(function () {
				callback(null, validator);
			});
			return validator;
		} else {
			var anonymousGen = new schema2js.Generator(generatorConfig);
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

	function RootModel(initialValue, url, validatorFunctions) {
		var value;
		var schemaMap = {};
		var missingSchemas = {};
		var errors = [];
		var pendingSchemaFetch = false;
		
		this.url = url || ('tmp://' + Math.random().toString().substring(2));
		this.http = {
			status: null,
			headers: {}
		};
		
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
			missingSchemas = {};
			errors = [];
			for (var i = 0; i < validatorFunctions.length; i++) {
				errors = errors.concat(validatorFunctions[i](value, "", schemaMap, missingSchemas));
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
					missingSchemas = {};
					errors = [];
					for (var i = 0; i < validatorFunctions.length; i++) {
						errors = errors.concat(validatorFunctions[i](value, "", schemaMap, missingSchemas));
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
		this.getPathErrors = function (path, includeSchemaErrors, immediateOnly) {
			path = path || "";
			var result = errors.filter(function (error) {
				return error.path == path
					|| (!immediateOnly && error.path.substring(0, path.length) == path
						&& error.path.charAt(path.length) == '/');
			});
			if (includeSchemaErrors) {
				for (var dataPath in missingSchemas) {
					if (dataPath == path
						|| (!immediateOnly && dataPath.substring(0, path.length) == path
							&& dataPath.charAt(path.length) == '/')) {
						missingSchemas[dataPath].forEach(function (schemaUrl) {
							var baseUrl = schemaUrl.replace(/#.*/, '');
							if (requestErrors[baseUrl]) {
								result.push({
									code: ErrorCodes.SCHEMA_FETCH_ERROR,
									path: dataPath,
									params: {message: requestErrors[baseUrl].message, status: (requestErrors[baseUrl].httpStatus || null)},
									schema: schemaUrl
								});
							} else {
								result.push({
									code: ErrorCodes.SCHEMA_MISSING,
									path: dataPath,
									params: {},
									schema: schemaUrl
								});
							}
						});
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
		url: function () {
			return this._root.url + '#' + encodeURI(this._path);
		},
		httpStatus: function (status) {
			return this._root.http.status;
		},
		httpHeaders: function () {
			return this._root.http.headers;
		},
		httpHeader: function (key) {
			return this._root.http.headers[key.toLowerCase()] || null;
		},
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
		map: function (callback) {
			var result = [];
			this.items(function (item, i) {
				var entry = callback(item, i);
				if (typeof entry !== 'undefined') {
					result.push(entry);
				}
			});
			return result;
		},
		keys: function (pathSpec) {
			var value = this.get(pathSpec);
			if (!value || Array.isArray(value) || typeof value !== 'object') return [];
			return Object.keys(value);
		},
		has: function (pathSpec) {
			return this.jsonType(pathSpec) !== 'undefined';
		},
		prop: function (key) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
		},
		props: function (keys, callback) {
			if (typeof keys === 'function') {
				callback = keys;
				keys = null;
			}
			keys = keys || this.keys();
			for (var i = 0; i < keys.length; i++) {
				callback(this.prop(keys[i]), keys[i]);
			}
			return this;
		},
		mapProps: function (keys, callback) {
			if (typeof keys === 'function') {
				var result = {};
				this.props(function (prop, key) {
					var entry = keys(prop, key);
					if (typeof entry !== 'undefined') {
						result[key] = entry;
					}
				});
				return result;
			} else {
				var result = [];
				for (var i = 0; i < keys.length; i++) {
					var entry = callback(this.prop(keys[i]), keys[i]);
					if (typeof entry !== 'undefined') {
						result.push(entry);
					}
				}
				return result;
			}
		},
		schemas: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathSchemas(this._path + pathSpec);
		},
		hasSchema: function (pathSpec, url) {
			if (typeof url !== 'string') {
				url = pathSpec;
				pathSpec = null;
			}
			return this.schemas(pathSpec).indexOf(url) !== -1;
		},
		errors: function (pathSpec, includeSchemaErrors, exactOnly) {
			if (pathSpec === true || pathSpec === false) {
				exactOnly = includeSchemaErrors;
				includeSchemaErrors = pathSpec;
				pathSpec = "";
			} else if (pathSpec == null) {
				pathSpec = "";
			}
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathErrors(this._path + pathSpec, includeSchemaErrors, exactOnly);
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
		var pendingUrls = Object.keys(pendingRequests);
		if (pendingUrls.length === 0) {
			generatedClasses = generator.classes(null, requestFunction);
			if (generator.missing().length) {
				// induce another round of requests
				return whenSchemasFetched();
			}
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
		if (callback) {
			whenAllSchemasFetchedCallbacks.push(callback);
		}
		generator.missing().forEach(function (missingUrl) {
			var baseUrl = missingUrl.replace(/#.*/, '');
			if (!schemaStore.missing(missingUrl) || !schemaStore.missing(baseUrl)) {
				return checkSchemasFetched(true);
			}
			missingUrl = baseUrl;
			
			if (pendingRequests[missingUrl]) return;
			pendingRequests[missingUrl] = true;
			requestFunction({method: 'GET', url: missingUrl}, function (error, data) {
				delete pendingRequests[missingUrl];
				if (error) {
					if (typeof console !== 'undefined' && console.error) {
						console.error('Error fetching ' + missingUrl + ':', error);
					}
					requestErrors[missingUrl] = error;
					generator.addSchema(missingUrl, null);
				} else {
					generator.addSchema(missingUrl, data || null);
				}
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
		var fragment = params.url.replace(/^[^#]*#?/, '');
		params.url = params.url.replace(/#.*/, '');
		
		if (fragment) throw new Error('Fragments not currently supported: #' + fragment);
		
		requestFunction(params, function (error, data, status, headers) {
			if (error) return callback(error);
			var schemas = hintSchemas;
			// TODO: parse headers for schema
			var result = api.create(data, params.url, schemas, callback);
			var rootModel = result._root;
			var newHeaders = {};
			for (var key in headers || {}) {
				newHeaders[key.toLowerCase()] = headers[key];
			}
			rootModel.http = {status: status || null, headers: newHeaders};
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
		if (typeof schemas === 'string' || (schemas && typeof schemas === 'object' && !Array.isArray(schemas))) schemas = [schemas];
		schemas = schemas || [];

		var validatorFunctions = schemas.map(function (schema) {
			return api.validationErrors(schema);
		});

		var rootModel = new RootModel(initialValue, url, validatorFunctions);
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
	
	// Default request function in browser
	if (typeof XMLHttpRequest === 'function') {
		api.setRequestFunction(function (params, callback) {
			if (params.method !== 'GET') throw new Error('Only GET supported for now');
			
			var request = new XMLHttpRequest();
			request.open(params.method, params.url, true, params.user, params.password);
			request.responseType = 'text';
			request.onreadystatechange = function () {
				if (request.readyState !== 4) return;
				var error = null;
				if (request.status < 200 || request.status > 299) {
					error = new Error(request.status + ' ' + request.statusText);
				}
				var headers = {};
				request.getAllResponseHeaders().split(/\r?\n/g).forEach(function (line) {
					if (!line) return;
					var match = /^([^\:\s]+)\s*\:\s*(.*)$/.exec(line);
					if (!match) throw new Error('Failed header parse:', JSON.stringify(line));
					var key = match[1].toLowerCase();
					var value = match[2];
					//value.match(/(^|,)(([^,\\"]|"([^"\\]|\\.)*")*)/g);
					headers[key] = (value.length > 1) ? value : value[0];
				});
				
				var data = request.responseText;
				try {
					data = JSON.parse(data);
				} catch (e) {
					error = error || e;
				}
				callback(error, data, request.status, headers);
			};
			for (var key in params.headers) {
				request.setRequestHeader(key, params.headers[key]);
			}
			request.send();
		});
	}
	
	return api;
});