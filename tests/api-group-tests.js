var IdmCore = require('../index');
var clone = require('clone');
var assert = require('assert');
var deepdif = require('deep-diff');
var createError = require('http-errors');
var fs = require('fs');
var dbconnection = require('agile-idm-entity-storage').connectionPool;
//var EntityStorage = require('../../agile-idm-entity-storage/lib/level-storage');
var db;
//conf for the API (components such as storage and authentication for the API may be replaced during tests)
var dbName = "./database";
var rmdir = require('rmdir');
var conf = {
  "storage": {
    "dbName": dbName
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
var user_info = {
  id: "6328602477442473!@!auth_type",
  entity_type: "/user",
  user_name: "6328602477442473",
  auth_type: "auth_type",
  owner: "6328602477442473!@!auth_type"
};
//default data for the tests
var token = "6328602477442473";
var action = "create";
var entity_type = "/sensor";
var entity_id = "323";
var entity_1 = {
  "name": "Barack Obam2a",
  "token": "DC 20500"
};
var group_name = "group";

function cleanDb(c) {
  //disconnect in any case.
  function disconnect(done) {
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
  //if there is a policy file delete it
  fs.exists(conf.policies.dbName, function (exists) {
    if (exists) {
      fs.unlink(conf.policies.dbName, function () {
        disconnect(c);
      });
    } else {
      disconnect(c);
    }
  });
}

//NOTE connection is mocked to have a connection that is reset after each test (but only after each test!) A bit different that level-storage test.
/*var dbconnection = function (conf) {
  return new Promise(function (resolve, reject) {
    if (db)
      resolve(db);
    else { //this happens at the beginning (and only at the beginning) of every test
      db = new EntityStorage();
      db.init(conf.storage, function (result) {
        return resolve(db);
      });
    }
  });
}*/
var pepMockOk = {
  declassify: function (userInfo, entityInfo) {
    return new Promise(function (resolve, reject) {
      resolve(entityInfo);
    });
  },
  declassifyArray: function (userInfo, array) {
    return new Promise(function (resolve, reject) {
      resolve(array);
    });
  }
};

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
  },
  canWriteToAllAttributes: function (userInfo, entityInfo) {
    return new Promise(function (resolve, reject) {
      //console.log('resolving with entities '+JSON.stringify(entities));
      resolve();
    });
  }

};

//Tests!
describe('Groups Api', function () {

  describe('#createGroup  and readGroup()', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when group is not there', function (done) {
      var idmcore = new IdmCore(conf);
      var owner = token + "!@!" + "auth_type";
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      idmcore.readGroup(user_info, group_name, owner)
        .then(function (read) {}, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        }).catch(function (err) {
          throw err;
        });

    });

    it('should create a group by id and return the same afterwards', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection);
      var entity = clone(entity_1);
      var owner = token + "!@!" + "auth_type";
      idmcore.createGroup(user_info, group_name)
        .then(function (data) {
          if (group_name === data.group_name && data.owner === owner) {
            return idmcore.readGroup(user_info, group_name, owner);
          }
        }).then(function (read) {
          if (group_name == read.group_name && read.owner === owner) {
            done();
          }
        }, function handlereject(r) {
          throw r;
        }).catch(function (err) {
          throw err;
        });
    });
  });

  describe('#delete and read Group()', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when attemtpting to delete data is not there', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      idmcore.deleteGroup(user_info, group_name, "unesistent owner")
        .then(function (read) {}, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        }).catch(function (err) {
          throw err;
        });
    });

    it('should delete a group  by id', function (done) {

      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      idmcore.createGroup(user_info, group_name)
        .then(function (data) {
          if (group_name === data.group_name && data.owner === owner)
            return idmcore.deleteGroup(user_info, group_name, owner);
        }).then(function () {
          return idmcore.readGroup(user_info, group_name, owner);
        }).then(function () {
          throw new Error("should not return anything");
        }, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        });

    });
  });

  describe('#add entity to group', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 404 error when attempting to add a non existing entity to a group', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      idmcore.createGroup(user_info, group_name)
        .then(function (read) {
          return idmcore.addEntityToGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {

        }, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        });
    });

    it('should reject with 404 error when attempting to add an exiting entity to a non existing group', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      idmcore.createEntity(user_info, entity_id, entity_type, entity_1)
        .then(function (read) {
          return idmcore.addEntityToGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {

        }, function handlereject(error) {
          if (error.statusCode == 404) {
            done();
          }
        });
    });

    it('should resolve with a modified entity after adding it to a gorup', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      var ps = [idmcore.createEntity(user_info, entity_id, entity_type, entity_1), idmcore.createGroup(user_info, group_name)];
      Promise.all(ps)
        .then(function (read) {
          return idmcore.addEntityToGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {
          return idmcore.readEntity(user_info, entity_id, entity_type);
        }).then(function (entityFinal) {
          if (entityFinal.groups.filter(function (v) {
              return (group_name == v.group_name && v.owner == owner);
            }).length == 1)
            done();
        }, function handlereject(error) {});
    });

  });

  describe('#remove entity from a  group', function () {

    afterEach(function (done) {
      cleanDb(done);
    });

    it('should reject with 409 error when attempting to remove a non existing entity from a group', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      idmcore.createGroup(user_info, group_name)
        .then(function (read) {
          return idmcore.removeEntityFromGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {

        }, function handlereject(error) {
          if (error.statusCode == 409) {
            done();
          }
        });
    });

    it('should reject with 404 error when attempting to remove an exiting entity from a non existing group', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      idmcore.createEntity(user_info, entity_id, entity_type, entity_1)
        .then(function (read) {
          return idmcore.removeEntityFromGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {

        }, function handlereject(error) {

          if (error.statusCode == 404) {
            done();
          } else {
            throw new Error('found unexpected error' + error);
          }

        });
    });

    it('should resolve with a modified entity without the group  after removing the entity from a gorup where it was', function (done) {
      var idmcore = new IdmCore(conf);
      idmcore.setMocks(null, null, PdpMockOk, dbconnection, pepMockOk);
      var owner = token + "!@!" + "auth_type";
      var ps = [idmcore.createEntity(user_info, entity_id, entity_type, entity_1), idmcore.createGroup(user_info, group_name)];
      Promise.all(ps)
        .then(function (read) {
          return idmcore.addEntityToGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function (res) {
          return idmcore.readEntity(user_info, entity_id, entity_type);
        }).then(function (entityFinal) {
          if (entityFinal.groups.filter(function (v) {
              return (group_name == v.group_name && v.owner == owner);
            }).length == 1)
            return idmcore.removeEntityFromGroup(user_info, group_name, owner, entity_id, entity_type);
        }).then(function () {
          return idmcore.readEntity(user_info, entity_id, entity_type);
        }).then(function (entityFinal) {
          if (entityFinal.groups.filter(function (v) {
              return (group_name == v.group_name && v.owner == owner);
            }).length == 0)
            done();
        }, function handlereject(error) {});
    });

  });
});
