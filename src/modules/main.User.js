/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


function UserId(encUser, encTld) {
  console.assert(typeof encUser === "string", "invalid user =", encUser);
  console.assert(typeof encTld  === "string", "invalid loginTld =", encTld);
  this._encName = encUser;
  this._encTld = encTld;
}


UserId.prototype = {

  toString: function() {
    return JSON.stringify(this);
  },


  toJSON: function() { // indirectly called by toString
    return {
      "encodedUser":this.encodedName, "encodedTld":this.encodedTld,
      "x-user": this.plainName + " " + this.plainTld
    };
  },


  equals: function(user) {
    return (user._encName === this._encName) && (user._encTld  === this._encTld);
  },


  toNewAccount: function() {
    return new UserId(UserUtils.NewAccount, this._encTld);
  },


  isTldValid: function(encTld) {
    console.assert(LoginDB.isLoggedIn(encTld), "not logged in");
    var x = LoginDB._loggedInTabs[encTld];
    return x.indexOf(this._encTld) > -1;
  },


  get isNewAccount() {
    return this._encName === UserUtils.NewAccount;
  },


  get plainTld() {
    return StringEncoding.decode(this._encTld);
  },


  get plainName() {
    return StringEncoding.decode(this._encName);
  },


  get encodedTld() {
    return this._encTld;
  },


  get encodedName() {
    return this._encName;
  }
};



function DocumentUser(user, plainDocTld, topInnerId) {
  console.assert(user !== null, "null user");
  console.assert(typeof user        === "object", "invalid user =", user);
  console.assert(typeof plainDocTld === "string", "invalid plainDocTld =", plainDocTld);
  console.assert(typeof topInnerId  === "number", "invalid topInnerId =", topInnerId);
  console.assert(WinMap.isTabId(WinMap.getInnerEntry(topInnerId).parentInnerId), "not a top id", user, plainDocTld, topInnerId);
  this._user = user;
  this._topInnerId = topInnerId;
  this._ownerDocTld = plainDocTld;
  this._ownerEncodedDocTld = StringEncoding.encode(plainDocTld);
}


DocumentUser.prototype = {

  toJSON: function() {
    return {
      "x-ownerTld": this._ownerDocTld,
      "topInnerId": this._topInnerId,
      "x-user": this.user.plainName + " " + this.user.plainTld
    };
  },


  toString: function() {
    return JSON.stringify(this);
  },


  get user() {
    return this._user;
  },


  get ownerTld() {
    return this._ownerDocTld;
  },


  get encodedDocTld() {
    return this._ownerEncodedDocTld;
  },


  equalsToLoggedInTld: function(assetTld) {
    return assetTld === this._ownerDocTld;
  },


  _isAnonTld: function(assetTld) {
    if (assetTld === this._ownerDocTld) {
      return false;
    }
    // assetTld is a different tld (and host) from document
    var assetUri = Services.io.newURI("http://" + assetTld, null, null); // TODO remove assetTld=>uri workaround
    var docUser = WinMap.findUser(assetUri, this._topInnerId);
    if (docUser === null) {
      return true;
    }
    // is assetTld logged in? e.g. facebook.com
    WinMap.setUserForTab(WinMap.getTopOuterIdFromInnerId(this._topInnerId), docUser.ownerTld, docUser.user);
    return false;
  },


  appendLoginToUri: function(uri) {
    var u = uri.clone();
    u.host = this.appendLogin(u.host);
    return u;
  },


  appendLogin: function(assetDomain) {
    console.assert(typeof assetDomain === "string", "invalid appendLogin =", assetDomain);
    var user = this.user;
    if (user.isNewAccount) {
      return assetDomain;
    }

    var assetTld = getTldFromHost(assetDomain);
    if (this._isAnonTld(assetTld)) {
      return assetDomain + "." + this.encodedDocTld              + "-" + user.encodedName + "-" + user.encodedTld + ".${INTERNAL_DOMAIN_SUFFIX_ANON}";
    } else {
      // We need to use tld(assetDomain) ==> otherwise, we couldn't (easily) locate the cookie for different subdomains
      // TODO BUG --is it still valid?
      return assetDomain + "." + StringEncoding.encode(assetTld) + "-" + user.encodedName + "-" + user.encodedTld + ".${INTERNAL_DOMAIN_SUFFIX_LOGGEDIN}";
    }
  }

};



var UserUtils = {

  NewAccount: "",

  equalsUser: function(user1, user2) {
    if ((user1 === null) && (user2 === null)) {
      return true;
    }
    if ((user1 !== null) && (user2 !== null)) {
      return user1.equals(user2);
    }
    return false;
  },


  isAnon: function(docUser) {
    return (docUser === null) || docUser.user.isNewAccount;
  },


  _getLabels: function(internalHost) {
    if (hasRootDomain("${INTERNAL_DOMAIN_SUFFIX_LOGGEDIN}", internalHost) === false) {
      return null;
    }

    // internalHost = .youtube.com.[youtube.com]-[user@foo]-[google.com].multifox-auth-X
    // [0] multifox-auth-X
    // [1] [youtube.com]-[user@gmail.com]-[google.com]
    // [2] com
    // [3] youtube
    // [4] (empty?)
    var labels = internalHost.split(".").reverse();
    console.assert(labels[0] === "${INTERNAL_DOMAIN_SUFFIX_LOGGEDIN}", "_getLabels", internalHost);
    return labels;
  },


  // returns ".example.com", "example.com" ...
  getRealHost: function(internalHost) {
    var labels = this._getLabels(internalHost);
    return labels === null ? null // normal host
                           : labels.slice(2).reverse().join(".");
  },


  getEncodedLogin: function(internalHost) {
    var labels = this._getLabels(internalHost);
    if (labels === null) {
      return null;
    }
    var strip = labels[1].split("-");
    if (strip.length !== 3) {
      return null;
    }
    return {
      rawData:   labels[1],
      tabTld:    strip[0], // TODO could be replaced by labels[3]+[4]...
      loginUser: strip[1],
      loginTld:  strip[2]
    };
  }

};
