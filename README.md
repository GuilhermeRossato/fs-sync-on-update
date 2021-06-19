# Nodejs rsync simpler version (One-way sync file system updates)

This is a pair of client and server NodeJS scripts used to help development between two servers by sending file and folder updates to the destination (server) from the (client) file system when these changes are detected.

It achieves the same behaviour as [rsync](https://rsync.samba.org/) in watch mode: it watches local files then aggregates and combines events every 400ms, then sends these changes to the server so that the server can keep mimick the changes. The only difference is that its just a pair of NodeJS scripts that use no dependency (besides NodeJS).

## How does it work

The client watches for file changes on its local file system and when it detects something it opens a TCP Socket to the server and sends the list of file system events, including file contents.

## Why use this

Suppose you have two virtual machines, one of them is your web server and the other is your development enviroment, with all your editing programs, debuggers, and fancy pants.

When you save your source code the pair of client and server on this repository will send that file update to your server so that both contain the same files with the same contents in the same folders.

```bash
# client
echo hello > ~/my-project/my-source-file.c
# just wrote a file, normal stuffm but `client.js` will send this to server
```

```bash
# server, 400ms later
cat ~/my-project-elsewhere/my-source-file.c
hello
# file has appeared because of the `server.js` script, which received the file and its content
```

## How to use it without downloading first

Read the next section to understand how to use it, this section describes how to run it from the command line, downloading the script as you execute it:

### Client command line

This is where you will edit your files

```bash
# coming soon
node -e "require('https').get({host:'raw.githubusercontent.com',port:443,path:'\/GuilhermeRossato\/fs-sync-on-update\/master\/client.js'}, function(res) {res.setEncoding('utf8');let parts=[];res.on('data',part=>parts.push(part)).on('end',()=>{require('vm').runInNewContext(parts.join(''),{process,console,require});});});"
```

### Server command line

This is where the files should be kept syncronized with the client

```bash
# coming soon
node -e "require('https').get({host:'raw.githubusercontent.com',port:443,path:'\/GuilhermeRossato\/fs-sync-on-update\/master\/server.js'}, function(res) {res.setEncoding('utf8');let parts=[];res.on('data',part=>parts.push(part)).on('end',()=>{require('vm').runInNewContext(parts.join(''),{process,console,require});});});"
```

## How to use it

On your client system, the one where files will be changed by external applications, open the terminal and navigate to the root of your project, then run the client script, like so:

```
cd ~/my-project/
node ~/fs-sync-on-update/client.js
```

The script asks the host and the port of the server so that a connection can be created when there is updates to send. Remember that the connection is not tested initially, only when there are updates to send.

Then open your server system, the one where you wish the file system was kept updated and syncronized to the client file system and go to the root of your project, then run the server script, like so:

```
cd ~/same-project-but-elsewhere/
node ~/fs-sync-on-update/server.js
```

The script will also ask the host and the port of the server so that you can configure which host and port to listen for incoming requests.

After the setup, open your project at `~/my-project/` and create or change a file, the server should print something like `File updated: ...` or `Folder created: ...`. From now on all file changes made in the client will be sent to the server. If you change a file in the server, however, then nothing will happen, as the server does not notify the client of updates.

## Dependencies

None, you just need NodeJS installed. It uses the `net` inbuilt module to exchange messages.

## Security / Password

Attention: Even with a strong password you should not keep the server running while not developing.

Both the client and the server script must contain the same password (defined at line 6 of each script) for it to work, otherwise client requests is denied with the server reply of `Authentication error`.

The default password is simply `gk`.

This pair of scripts is intended to be run inside trusted networks, if you must run it globally I recommend you use a security layer over TCP, but you will have to add the dependency and manage it yourself, my goal here is to make something simple.

## How does it work precisely

It works by creating a virtual file system on the client and then checking periodically (every 200ms) all the files and folders in the project to see if their modified date or their size changed so that when a change is detected it connects to the server and sends these changes in a list, then closes the TCP socket until new changes are detected again.

Currently it will detect any of these 5 types of file system changes:

- File Created
- File Modified
- File Removed
- Folder Removed
- Folder Created

When any of these things are detected, we aggregate them into a list of events, wait for 200ms to make sure files are fully written to, then read them again if necessary, then send them to the server in a JSON format.

The server then tries to mimick the updates, files change, folders are removed, etc.