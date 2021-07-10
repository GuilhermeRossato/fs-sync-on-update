console.log("This is the file client that send file updates");
console.log("Source directory: " + process.cwd());

// You may change this if you wish
// both the server and the client must both have the same to work
const password = "gk";

const net = require("net");
const fs = require("fs").promises;
const readline = require('readline');
const endIndicator = "(#" + "@~|)";

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

async function populateVirtualFileSystem(fullPath, virtualFs = {}) {
	const nodes = await fs.readdir(fullPath, "utf8");
	for (let node of nodes) {
		let stats;
		try {
			stats = await fs.stat(fullPath + "/" + node);
		} catch (err) {
			console.log("Error reading file at " + JSON.stringify(fullPath + "/" + node) + ": " + err.stack);
			continue;
		}
		if (stats.isDirectory()) {
			virtualFs[node] = {};
			await populateVirtualFileSystem(fullPath + "/" + node, virtualFs[node]);
		} else if (stats.isFile()) {
			virtualFs[node] = [stats.size, stats.mtimeMs];
		} else {
			console.warn("Unknown node type: " + node);
		}
	}
}

async function recursivelySendDeletion(fullPath, virtualFs, onChange) {
	for (let node in virtualFs) {
		if (typeof virtualFs[node] === "object" && !(virtualFs[node] instanceof Array)) {
			recursivelySendDeletion(fullPath + "/" + node, virtualFs[node], onChange);
		} else {
			onChange("file-deleted", fullPath + "/" + node, 0);
		}
		delete virtualFs[node];
	}
	onChange("folder-deleted", fullPath, 0);
}

async function findChangesVirtualFileSystem(fullPath, virtualFs, onChange, allChange = false) {
	let nodes = await fs.readdir(fullPath, "utf8");
	for (let node in virtualFs) {
		if (!nodes.includes(node)) {
			if (typeof virtualFs[node] === "object" && !(virtualFs[node] instanceof Array)) {
				recursivelySendDeletion(fullPath + "/" + node, virtualFs[node], onChange);
			} else {
				onChange("file-deleted", fullPath + "/" + node, 0);
			}
			delete virtualFs[node];
		}
	}
	nodes = await fs.readdir(fullPath, "utf8");
	for (let node of nodes) {
		let stats;
		try {
			stats = await fs.stat(fullPath + "/" + node);
		} catch (err) {
			console.log("Error reading file at " + JSON.stringify(fullPath + "/" + node) + ": " + err.stack);
			continue;
		}
		if (stats.isDirectory()) {
			if (!virtualFs[node] || (virtualFs[node] instanceof Array)) {
				allChange = true;
				virtualFs[node] = {};
				onChange("folder-created", fullPath + "/" + node, 0);
			}
			await findChangesVirtualFileSystem(fullPath + "/" + node, virtualFs[node], onChange, allChange);
		} else if (stats.isFile()) {
			if (allChange || !virtualFs[node]) {
				onChange("file-created", fullPath + "/" + node, stats.size);
			} else if (!(virtualFs[node] instanceof Array)) {
				onChange("file-created", fullPath + "/" + node, stats.size);
			} else if (virtualFs[node][0] !== stats.size || virtualFs[node][1] !== stats.mtimeMs) {
				onChange("file-modified", fullPath + "/" + node, stats.size);
			}
			virtualFs[node] = [stats.size, stats.mtimeMs];
		} else {
			console.warn("Unknown node type: " + fullPath + "/" + node);
		}
	}
}

(async function init() {
	const host = (await askQuestion("What is the server host [localhost]: ")).trim() || global.sync_hostname || process.argv[2] || "localhost";
	if (host !== "localhost") {
		console.log("Host: " + host);
	}

	const port = (await askQuestion("What is the server port [6937]: ")).trim() || global.sync_port || process.argv[3] || "6937";
	if (port !== "6937") {
		console.log("Port: " + port);
	}

	const cwd = process.cwd();
	const virtualFs = {};
	await populateVirtualFileSystem(cwd, virtualFs);
	while (true) {
		await new Promise((r) => setTimeout(r, 200));
		let changes = [];
		await findChangesVirtualFileSystem(cwd, virtualFs, function(type, filePath, fileSize) {
			changes.push({
				type,
				filePath: filePath.replace(cwd + "/", ""),
				fileSize
			})
		});
		if (changes.length === 0) {
			continue;
		}
		await new Promise((r) => setTimeout(r, 200));
		const data = await Promise.all(changes.map(async change => ({
			type: (change.type === "file-deleted" ? "unlink" : (change.type === "folder-deleted" ? "rmdir" : (change.type === "folder-created" ? "mkdir" : "write"))),
			path: change.filePath,
			content: change.type.includes("folder") || change.type.includes("deleted") ? null : (await fs.readFile(change.filePath, "utf8")),
			size: change.fileSize
		})));

		await Promise.all(
			data.filter(
				change => change.filePath && change.content && change.size !== change.content.length
			).map(
				async change => change.content = await fs.readFile(change.filePath, "utf8")
			)
		);

		const veredict = await new Promise(resolve => {
			try {
				const socket = net.createConnection({
					host,
					port
				});
				socket.on("connect", function() {
					socket.write(password+JSON.stringify(data)+endIndicator);
					console.log("Sent " + data.length + " updates to server");
				});
				socket.on("data", function(data) {
					const message = data.toString("utf8");
					socket.end();
					resolve(message === "ok" ? true : message);
				});
				socket.on("error", function(error) {
					resolve("Socket error:" + error.message);
				});
				socket.on("close", function() {
					resolve(false);
				});
				socket.on("end", function() {
					resolve(false);
				});
			} catch (err) {
				resolve("This should never fucking happen (client): " + err.message);
			}
		});
		if (veredict === true) {
			continue;
		}
		console.log("The server replied that something went wrong:");
		console.log(veredict);
	}
})().then(null, err => console.log(err));
