"use strict";
(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define([], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory();
	} else {
		// Browser globals
		global.JsonModel = factory();
	}
})(this, function () {
	var api = {
		version: /*VERSION*/"0.2.24"/*/VERSION*/
	};
