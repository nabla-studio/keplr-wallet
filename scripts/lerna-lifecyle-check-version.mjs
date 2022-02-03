/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */

import "zx/globals";
import semver from "semver";
import fs from "fs";

const version = require("../lerna.json").version;
(async () => {
  const sementic = semver.parse(version);
  if (sementic.prerelease.length === 0) {
    const packages = fs.readdirSync(`${__dirname}/../packages/`);
    for (const pack of packages) {
      const stat = fs.statSync(`${__dirname}/../packages/${pack}`);
      if (stat.isDirectory()) {
        const packageJson = JSON.parse(
          fs.readFileSync(
            `${__dirname}/../packages/${pack}/package.json`,
            "utf8"
          )
        );
        const sem = semver.parse(packageJson.version);
        if (sem.prerelease.length !== 0) {
          throw new Error(
            `The root version doesn't have prelease, but some packages have a prelease: ${pack}`
          );
        }
      }
    }
  }
})();

/* eslint-enable import/no-extraneous-dependencies, @typescript-eslint/no-var-requires */
