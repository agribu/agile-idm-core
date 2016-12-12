var IdmCore = require('../index');
var clone = require('clone');
var assert = require('assert');
var deepdif = require('deep-diff');
var createError = require('http-errors');
var fs = require('fs');
var dbconnection = require('agile-idm-entity-storage').connectionPool;
var db;
//conf for the API (components such as storage and authentication for the API may be replaced during tests)
var dbName = "./database";
var rmdir = require('rmdir');
var conf = {
  "storage": {
    "dbName": dbName
  },
  "authentication": {
    "web-server": "nowhere...",

  },
  "policies": {
    "dbName": "./policies.json",
    "create_entity_policy": [
      // actions of an actor are not restricted a priori
      {
        target: {
          type: "any"
        }
      }, {
        source: {
          type: "any"
        }
      }
    ],
    "top_level_policy": [
      // all properties can be read by everyone
      {
        target: {
          type: "any"
        }
      },
      // all properties can only be changed by the owner of the entity
      {
        source: {
          type: "user"
        },
        locks: [{
          lock: "isOwner"
        }]
      }
    ],
    "attribute_level_policies": {
      "user": {
        "password": [
          // the property can only be read by the user itself
          {
            target: {
              type: "user"
            },
            locks: [{
              lock: "isOwner"
            }]
          },
          // the property can be set by the user itself and
          {
            source: {
              type: "user"
            },
            locks: [{
              lock: "isOwner"
            }]
          },
          // by all users with role admin
          {
            source: {
              type: "user"
            },
            locks: [{
              lock: "attrEq",
              args: ["role", "admin"]
            }]
          }
        ],
        "role": [
          // can be read by everyone
          {
            target: {
              type: "any"
            }
          },
          // can only be changed by users with role admin
          {
            source: {
              type: "user"
            },
            locks: [{
              lock: "attrEq",
              args: ["role", "admin"]
            }]
          }
        ]
      },
      "sensor": {
        "credentials": [
          // the property can only be read by the user itself
          {
            target: {
              type: "user"
            },
            locks: [{
              lock: "isOwner"
            }]
          },
          // the property can be set by the user itself and
          {
            source: {
              type: "user"
            },
            locks: [{
              lock: "isOwner"
            }]
          }
        ]
      }

    }
  },
  "schema-validation": [{
    "id": "/sensor",
    "type": "object",
    "properties": {
      "name": {
        "type": "string"
      },
      "token": {
        "type": "string"
      }
    },
    "required": ["name"]
  }]
};

//default data for the tests
var token = "6328602477442473";
var user_info = {
  id: "6328602477442473!@!auth_type",
  entity_type: "/User",
  user_name: "6328602477442473",
  auth_type: "auth_type",
  owner: "6328602477442473!@!auth_type"
};

var action = "create";
var entity_type = "/sensor";
var entity_id = "323";
var entity_1 = {
  "name": "Barack Obam2a",
  "token": "DC 20500"
};

function cleanDb(done) {
  dbconnection("disconnect").then(function () {
    rmdir(dbName + "_entities", function (err, dirs, files) {
      rmdir(dbName + "_groups", function (err, dirs, files) {
        db = null;
        done();
      });
    });
  }, function () {
    throw Error("not able to close database");
  });
}

var PdpMockOk = {
  canRead: function (userInfo, entityInfo) {
    return new Promise(function (resolve, reject) {
      resolve(entityInfo);
    });
  },
  canDelete: function (userInfo, entityInfo) {
    return new Promise(function (resolve, reject) {
      resolve(entityInfo);
    });
  },
  canReadArray: function (userInfo, entities) {
    return new Promise(function (resolve, reject) {
      //console.log('resolving with entities '+JSON.stringify(entities));
      resolve(entities);
    });
  },
  canWriteToAttribute: function (userInfo, entities, attributeName, attributeValue) {
    return new Promise(function (resolve, reject) {
      //console.log('resolving with entities '+JSON.stringify(entities));
      resolve();
    });
  },
  canUpdate: function (userInfo, entityInfo) {
    return new Promise(function (resolve, reject) {
      //console.log('resolving with entities '+JSON.stringify(entities));
      resolve(entityInfo);
    });
  }

};

//Tests!
describe('Entities Api', function () {

  describe('#createEntity and readEntity()', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when data is not there', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      idmcore.readEntity(user_info, entity_id, entity_type)
        .then(function (read) {
          throw new Error('unexpec')
        }, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        }).catch(function (err) {
          throw err;
        });

    });

    it('should create an entity by id and return the same afterwards', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      idmcore.createEntity(user_info, entity_id, entity_type, entity)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined)
              return idmcore.readEntity(token, entity_id, entity_type);
          }
        }).then(function (read) {
          if (entity_id == read.id && entity_type == read.type && read.owner == token + "!@!" + "auth_type") {
            delete read.id;
            delete read.type;
            delete read.owner;
            if (deepdif.diff(read, entity) == undefined)
              done();
          }
        }, function handlereject(r) {
          throw r;
        }).catch(function (err) {
          throw err;
        });
    });
  });

  describe('#set attribute and read Entity()', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when attempting to update data that is not there', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      idmcore.setEntityAttribute(user_info, entity_id, entity_type, "attributename", "value")
        .then(function (read) {}, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        });

    });

    it('should update an entity by id and return the proper values afterwards', function (done) {
      var idmcore = new IdmCore(conf);
      var data2;
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      idmcore.createEntity(user_info, entity_id, entity_type, entity)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined) {
              data2 = clone(data);
              data2.name = "somenewname";
              return idmcore.setEntityAttribute(user_info, entity_id, entity_type, "name", "somenewname");
            }
          }
        }).then(function (result) {
          if (entity_id == result.id && entity_type == result.type && result.owner == token + "!@!" + "auth_type") {
            delete result.id;
            delete result.type;
            delete result.owner;
            if (deepdif.diff(result, data2) == undefined)
              return idmcore.readEntity(user_info, entity_id, entity_type);
          }
        })
        .then(function (read) {
          if (entity_id == read.id && entity_type == read.type && read.owner == token + "!@!" + "auth_type") {
            delete read.id;
            delete read.type;
            delete read.owner;
            if (deepdif.diff(read, data2) == undefined)
              done()
          }
        }, function handlereject(r) {
          throw r;
        })

    });
  });

  describe('#delete and readEntity()', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when attemtpting to delete data is not there', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      idmcore.deleteEntity(user_info, entity_id, entity_type)
        .then(function (read) {}, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        }).catch(function (err) {
          throw err;
        });
    });

    it('should delete an entity by id', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      idmcore.createEntity(user_info, entity_id, entity_type, entity)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined)
              return idmcore.deleteEntity(user_info, entity_id, entity_type);
          }
        }).then(function () {
          return idmcore.readEntity(user_info, entity_id, entity_type);
        }).then(function (read) {

        }, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        }).catch(function (err) {
          throw err;
        });
    });
  });

  describe('#search entity by attribute value', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when there is no entity with attribute value and type', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      idmcore.listEntitiesByAttributeValueAndType(user_info, [{
          attribute_type: "ss",
          attribute_value: "unexistent-stuff"
        }])
        .then(function (read) {
          if (read instanceof Array && read.length == 0)
            done();
        }, function handlereject(error) {

        }).catch(function (err) {
          throw err;
        });

    });

    it('should get an entity based on attribute value and type', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      var entity2 = clone(entity_1);
      var lookedfor = "123123";
      entity2.token = lookedfor;
      idmcore.createEntity(user_info, entity_id, entity_type, entity2)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity2) == undefined)
              return idmcore.createEntity(user_info, "someotherid", entity_type, entity)
          }
        }).then(function (data) {
          if ("someotherid" == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined)
              return idmcore.listEntitiesByAttributeValueAndType(user_info, [{
                attribute_type: "token",
                attribute_value: lookedfor
              }]);
          }
        }).then(function (list) {
          if (list.length == 1) {
            var data = list[0];
            if (data.token == lookedfor && entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") //more detailed checks in cases when there is only one or more are executed in the sqlite3 tests
              done();

          }
          //return idmcore.readEntity(token, entity_id, entity_type);
        }).then(function (read) {

        }, function handlereject(error) {
          throw error;
        }).catch(function (err) {
          throw err;
        });

    });

    it('should get an entity based on attribute value and type and entity_type', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      var entity2 = clone(entity_1);
      var lookedfor = "123123";
      entity2.token = lookedfor;
      idmcore.createEntity(user_info, entity_id, entity_type, entity2)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity2) == undefined)
              return idmcore.createEntity(user_info, "someotherid", entity_type, entity)
          }
        }).then(function (data) {
          if ("someotherid" == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined)
              return idmcore.listEntitiesByAttributeValueAndType(token, [{
                attribute_type: "token",
                attribute_value: lookedfor
              }], entity_type);
          }
        }).then(function (list) {
          if (list.length == 1) {
            var data = list[0];
            if (data.token == lookedfor && entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") //more detailed checks in cases when there is only one or more are executed in the sqlite3 tests
              done();

          }
          //return idmcore.readEntity(token, entity_id, entity_type);
        }).then(function (read) {

        }, function handlereject(error) {
          throw error;
        }).catch(function (err) {
          throw err;
        });

    });

    it('should not resolve with an entity when  attribute values and type match but entity_type does not', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      var entity2 = clone(entity_1);
      var lookedfor = "123123";
      entity2.token = lookedfor;
      idmcore.createEntity(user_info, entity_id, entity_type, entity2)
        .then(function (data) {
          if (entity_id == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity2) == undefined)
              return idmcore.createEntity(user_info, "someotherid", entity_type, entity)
          }
        }).then(function (data) {
          if ("someotherid" == data.id && entity_type == data.type && data.owner == token + "!@!" + "auth_type") {
            delete data.id;
            delete data.type;
            delete data.owner;
            if (deepdif.diff(data, entity) == undefined)
              return idmcore.listEntitiesByAttributeValueAndType(user_info, [{
                attribute_type: "token",
                attribute_value: lookedfor
              }], "unexistent_entity_typoe");
          }
        }).then(function (list) {
          if (list.length == 0) {
            done();

          }
          //return idmcore.readEntity(token, entity_id, entity_type);
        }).then(function (read) {

        }, function handlereject(error) {
          throw error;
        }).catch(function (err) {
          throw err;
        });

    });
  });
});
