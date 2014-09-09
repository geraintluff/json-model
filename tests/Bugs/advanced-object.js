var api = require('../../');
var assert = require('chai').assert;

describe('Bug from z-schema benchmarking', function () {
	afterEach(function(done){
		api.clean(done);
	});
	
	it('compiles correctly', function () {
		var schema = {
		    "$schema": "http://json-schema.org/draft-04/schema#",
		    "type": "object",
		    "properties": {
		        "/": { "$ref": "#/definitions/entry" }
		    },
		    "patternProperties": {
		        "^(/[^/]+)+$": { "$ref": "#/definitions/entry" }
		    },
		    "additionalProperties": false,
		    "required": [ "/" ],
		    "definitions": {
		        "entry": {
		            "$schema": "http://json-schema.org/draft-04/schema#",
		            "description": "schema for an fstab entry",
		            "type": "object",
		            "required": [ "storage" ],
		            "properties": {
		                "storage": {
		                    "type": "object",
		                    "oneOf": [
		                        { "$ref": "#/definitions/entry/definitions/diskDevice" },
		                        { "$ref": "#/definitions/entry/definitions/diskUUID" },
		                        { "$ref": "#/definitions/entry/definitions/nfs" },
		                        { "$ref": "#/definitions/entry/definitions/tmpfs" }
		                    ]
		                },
		                "fstype": {
		                    "enum": [ "ext3", "ext4", "btrfs" ]
		                },
		                "options": {
		                    "type": "array",
		                    "minItems": 1,
		                    "items": { "type": "string" },
		                    "uniqueItems": true
		                },
		                "readonly": { "type": "boolean" }
		            },
		            "definitions": {
		                "diskDevice": {
		                    "properties": {
		                        "type": { "enum": [ "disk" ] },
		                        "device": {
		                            "type": "string",
		                            "pattern": "^/dev/[^/]+(/[^/]+)*$"
		                        }
		                    },
		                    "required": [ "type", "device" ],
		                    "additionalProperties": false
		                },
		                "diskUUID": {
		                    "properties": {
		                        "type": { "enum": [ "disk" ] },
		                        "label": {
		                            "type": "string",
		                            "pattern": "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$"
		                        }
		                    },
		                    "required": [ "type", "label" ],
		                    "additionalProperties": false
		                },
		                "nfs": {
		                    "properties": {
		                        "type": { "enum": [ "nfs" ] },
		                        "remotePath": {
		                            "type": "string",
		                            "pattern": "^(/[^/]+)+$"
		                        },
		                        "server": {
		                            "type": "string",
		                            "anyOf": [
		                                { "format": "host-name" },
		                                { "format": "ipv4" },
		                                { "format": "ipv6" }
		                            ]
		                        }
		                    },
		                    "required": [ "type", "server", "remotePath" ],
		                    "additionalProperties": false
		                },
		                "tmpfs": {
		                    "properties": {
		                        "type": { "enum": [ "tmpfs" ] },
		                        "sizeInMB": {
		                            "type": "integer",
		                            "minimum": 16,
		                            "maximum": 512
		                        }
		                    },
		                    "required": [ "type", "sizeInMB" ],
		                    "additionalProperties": false
		                }
		            }
		        }
		    }
		};
		var data = {
		    "/": {
		        "storage": {
		            "type": "disk",
		            "device": "/dev/sda1"
		        },
		        "fstype": "btrfs",
		        "readonly": true
		    },
		    "/var": {
		        "storage": {
		            "type": "disk",
		            "label": "8f3ba6f4-5c70-46ec-83af-0d5434953e5f"
		        },
		        "fstype": "ext4",
		        "options": [ "nosuid" ]
		    },
		    "/tmp": {
		        "storage": {
		            "type": "tmpfs",
		            "sizeInMB": 64
		        }
		    },
		    "/var/www": {
		        "storage": {
		            "type": "nfs",
		            "server": "my.nfs.server",
		            "remotePath": "/exports/mypath"
		        }
		    }
		};
		
		try {
			var validator = api.validator(schema);
		} catch (e) {
			require('fs').writeFileSync('tmp.js', e.code);
			throw e;
		}
		
		var result = validator(data);
		assert(result.valid, 'should pass');
	});
});