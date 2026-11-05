import releases from "../../../docs/releases.yml?raw";
import sitePackage from "../../package.json";
import { frameworkVersionFromManifest } from "./release-selection";

export const frameworkVersion = frameworkVersionFromManifest(releases);
export const siteVersion = sitePackage.version;
