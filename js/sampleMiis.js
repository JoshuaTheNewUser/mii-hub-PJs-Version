/*
 * sampleMiis.js
 * Built-in Miis so the hub isn't empty.
 *  - SAMPLE_FILES: real Mii files (the bytes are stored as base64 text).
 *  - DEMO_FRIENDS: extra Miis described directly, to give everyone company.
 */
(function (root) {
  "use strict";

  root.SAMPLE_FILES = [
    {
      fileName: "Joe.miic",
      bytes: "BQXd9pcLaWtHotAAAABGkBJZ6RVKAG8AZQAAAAAAAAAAAAAAAAAAAEoAbwBlAAAAAAAAAAAAAAAAAAAAAQUaCgfUQAMAAQUEDAIKQQQDEQIMAAAEAP8ACAAACAQACgEAQv///2v/BAACFAMTAwgNAwAKAwYI//8AMAAAAAP///8E/0H//wQE//////8=",
    },
  ];

  root.DEMO_FRIENDS = [
    { name: "Mia", gender: 1, favoriteColor: 7, height: 55, build: 50, skin: "#ffd3ad", hairStyle: 2, hairColor: "#7c3a14", eyeStyle: 3, eyeColor: "#4870a0", browColor: "#7c3a14" },
    { name: "Leo", gender: 0, favoriteColor: 5, height: 90, build: 70, skin: "#de7942", hairStyle: 1, hairColor: "#1e1a18", eyeStyle: 0, eyeColor: "#663c2c", browColor: "#1e1a18", browStyle: 2 },
    { name: "Ava", gender: 1, favoriteColor: 8, height: 70, build: 45, skin: "#ffb669", hairStyle: 6, hairColor: "#d0a04a", eyeStyle: 0, eyeColor: "#387058", browColor: "#84581c", glasses: 1, glassesColor: "#a01818" },
    { name: "Sam", gender: 0, favoriteColor: 3, height: 40, build: 95, skin: "#ffaa8c", hairStyle: 4, hairColor: "#787878", eyeStyle: 1, browColor: "#787878", mustache: true, beard: true, facialHairColor: "#787878" },
    { name: "Kai", gender: 0, favoriteColor: 1, height: 75, build: 60, skin: "#ad5129", hairStyle: 7, hairColor: "#1e1a18", eyeStyle: 2, eyeColor: "#000000", browColor: "#1e1a18", glasses: 2 },
    { name: "Zoe", gender: 1, favoriteColor: 6, height: 60, build: 55, skin: "#632c18", hairStyle: 9, hairColor: "#1e1a18", eyeStyle: 3, eyeColor: "#663c2c", browColor: "#1e1a18" },
    { name: "Max", gender: 0, favoriteColor: 4, height: 100, build: 40, skin: "#ffd3ad", hairStyle: 5, hairColor: "#5c1812", eyeStyle: 0, eyeColor: "#4870a0", browColor: "#5c1812", hairFlip: true },
  ];
})(typeof self !== "undefined" ? self : this);
