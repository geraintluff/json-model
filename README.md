# JSON Models

This project defines a wrapper for JSON data, adding events, JSON Schema (validation/assignment), and bindings to HTML (server-side) and DOM (browser).

## Code-generation

As well as the generic container, this project can generate generate JavaScript classes/code from JSON Schemas.

Currently it just generates data-storage classes (which do things like fill out default values), but in the (hopefully near) future it will generate link/interaction methods based on `links`.

The validation/schema-assignment for the models is also done using generated code.