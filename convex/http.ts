import { httpRouter } from "convex/server";
import { download, options, upload } from "./privateFileHttp";

const http = httpRouter();

http.route({
  pathPrefix: "/private-files/upload/",
  method: "POST",
  handler: upload,
});
http.route({
  pathPrefix: "/private-files/download/",
  method: "GET",
  handler: download,
});
http.route({
  pathPrefix: "/private-files/upload/",
  method: "OPTIONS",
  handler: options,
});
http.route({
  pathPrefix: "/private-files/download/",
  method: "OPTIONS",
  handler: options,
});

export default http;
