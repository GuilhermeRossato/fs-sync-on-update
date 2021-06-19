console.log("This is the file server that listens for file updates");
console.log("Sink directory: " + process.cwd());

// You may change this if you wish
// both the server and the client must both have the same to work
const password = "gk";

const net = require("net");
const readline = require('readline');
const fs = require('fs');
const path = require('path');

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

function makeSureFolderExists(folderPath) {
	if (!fs.existsSync(folderPath)) {
		const dirname = path.dirname(folderPath);
		if (dirname !== "" && dirname !== folderPath) {
			makeSureFolderExists(dirname);
		}
		fs.mkdirSync(folderPath);
	}
}

(async function init() {
	const host = (await askQuestion("Server host [localhost]: ")).trim() || "localhost";
	if (host !== "localhost") {
		console.log("Host: " + host);
	}

	const port = (await askQuestion("Server port [6937]: ")).trim() || "6937";
	if (port !== "6937") {
		console.log("Port: " + port);
	}

	const server = net.createServer(function onClientConnect(client) {
		console.log("Source client: " + JSON.stringify(client.remoteAddress));

		client.on("data", (rawData) => {
			rawData = rawData.toString("utf8");
			if (rawData.substring(0, password.length) !== password) {
				try {
					client.end("Authentication error");
				} catch (err) {
				}
				return;
			}
			/**
			 * @type {{type: "unlink" | "rmdir" | "write"; path: string; content?: string; size: number}[]}
			 */
			let data;
			try {
				data = JSON.parse(rawData.substring(password.length).toString("utf8"));
			} catch (err) {
				try {
					client.end("Failed at interpreting message");
				} catch (err) {
				}
				console.log("Failed at interpretation: " + err.stack);
				return;
			}
			for (let change of data) {
				if (!["unlink", "rmdir", "mkdir", "write"].includes(change.type)) {
					client.end("Invalid type (" + change.type + ") for file " + change.path);
					return;
				}
				// console.log("Server Handling: " + change.path + " of type " + change.type);
				try {
					if (change.type === "unlink") {
						try {
							fs.unlinkSync(change.path);
						} catch (err) {
							if (err.code !== "ENOENT") {
								throw err;
							}
						}
						console.log("File removed:", change.path);
					} else if (change.type === "rmdir") {
						try {
							fs.rmdirSync(change.path);
						} catch (err) {
							if (err.code !== "ENOENT") {
								throw err;
							}
						}
						console.log("Folder removed:", change.path);
					} else if (change.type === "mkdir") {
						try {
							let dirname = path.dirname(change.path);
							if (dirname !== change.path) {
								makeSureFolderExists(dirname);
							}
						} catch (err) {
							client.end("Failed at making sure the path \"" + path.dirname(change.path) + "\" existed: " + err.stack);
							return;
						}
						try {
							fs.mkdirSync(change.path);
						} catch (err) {
							if (err.code !== "EEXIST") {
								throw err;
							}
						}
						console.log("Folder created:", change.path);
					} else if (change.type === "write") {
						try {
							let dirname = path.dirname(change.path);
							if (dirname !== change.path) {
								makeSureFolderExists(dirname);
							}
						} catch (err) {
							client.end("Failed at making sure the path \"" + path.dirname(change.path) + "\" existed: " + err.stack);
							return;
						}
						try {
							if (!fs.existsSync(path.dirname(change.path))) {
								console.log("The path to write does not exist!");
							}
							fs.writeFileSync(change.path, change.content, "utf8");
						} catch (err) {
							client.end("Failed writing " + change.path + ": " + err.stack);
							return;
						}
						console.log("File updated:", change.path);
					}
				} catch (err) {
					console.log("Failed at " + change.path + ": " + err.stack);
					client.end("Failed at " + change.path + ": " + err.stack);
					return;
				}
			}
			client.end("ok");
			return;
		});
	});

	server.listen(parseInt(port.toString(), 10), host);

})().then(null, console.log);
