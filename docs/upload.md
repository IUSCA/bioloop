# Upload Architecture

## 1. Introduction

Bioloop allows uploading one or more files through the browser, while ensuring strict access control to prevent unauthorized access. These chunks are then merged into corresponding files through workers.

## 2. Requirements and Limitations

Authorized users should be able to upload files directly from their web browsers. The uploaded files should be protected from unauthorized users who have access to Slate-Scratch.

Network timeouts, data corruption and other problems that arise from uploading large files must be avoided. To achieve this, our file upload architecture uploads files in chunks of 2 MB. Uploading files in chunks also gives us a more granular view into the upload state. 

Since our workers run on Colo nodes, it is convenient to upload files to Colo nodes, so they can be processed by workers, instead of uploading files to the main API server, and then transferring them to Colo nodes.

## 3. Architecture Overview

To meet the requirements outlined above, a distributed architecture is employed.

- UI Client: Users logs into the bioloop application through their web browsers and navigate to the appropriate page to initiate file uploads.
- API: This node serves the user interface and API endpoints with user and metadata stored in a PostgreSQL database but does not have direct access to the dataset files.
- Rhythm API: This node is used to trigger workflows from the UI.
- Workers / Colo Node: Processing of uploaded file chunks occurs on this node via a Celery task. The node also hosts an Nginx server with access to the uploaded file chunks.
- Signet: An OAuth server supporting client credential flow with Upload file scope to create secure tokens.
- File Upload Server (Nginx): A file server on the colo adjacent to data which recieves requests from users to upload files.
- Secure Upload API: A lightweight app that validates the incoming requests to the file upload API.


## 4. The Upload

### 4.1 Logging

For each upload, information is logged to the following relational tables (PostgreSQL):
1. `upload_log` - contains metadata about the upload itself. Is linked to one or more `file_upload_log` objects.
2. `file_upload_log` - contains metadata about a file being uploaded

### 4.2 Steps

1. Before an upload begins, the following things happen sequentially:
   - Checksum evaluation - MD5 checksums are evaluated for each file, as well as for each chunk per file. 
   - Any metadata associated with the upload - like related entities, names/checksums/paths of files being uploaded, etc. - are logged into persistent storage.
      1. Since this step involves writing to multiple tables, this information is logged in a single transaction.

2. The actual upload only begins once the above steps are successful.

3. Chunks are uploaded sequentially. If a chunk upload fails, the client-side retries the upload upto 5 times before failing.

4. The client first sends an HTTP request to upload a chunk to our main API server, which is then forwarded to another HTTP endpoint in the secure_upload NGINX server, which writes the received chunk to the filesystem, after validating its checksum (this is the first stage of checksum validation).

5. After all files' chunks are uploaded successfully, the client-side makes a request to the Rhythm API to trigger the `process_uploads` worker.

### 4.3 Directory structure
The following directories on the Colo node are used for uploads:
1. Uploads directory - 
2. Chunks subdirectory for an uploaded file - `[uploads_dir]/[upload_identifier]/chunked_files/[file_md5]`

Chunks are written to the `.../chunked_files/[file_md5]` subdirectory. Each chunk is named like `[file_md5]-[index]`. The `index` denotes the chunk's position in the file.

### 4.4 Access Control

To verify that a user is authorized to initiate an upload, we perform role-based checking when the Express API receives a request to upload a chunk. This validation cannot be performed on the secure_upload NGINX server, since we only maintain access-control data on the API server.

To be able to reach the oauth-secured secure_upload API, the client-side gets a token using the Signet service, and attaches it to the Authorization header before sending the request to secure_upload.

### 4.5 Status

The status of the upload, as well the status of each file in the upload goes through the following values:

| Status    | Description                                                                                     |
|-----------|-------------------------------------------------------------------------------------------------|
| UPLOADING    | Upload initiated through the browser                                                            |
| UPLOAD_FAILED | Upload could not be completed (network errors)                                                  |
| UPLOADED | All files successfully uploaded                                                                 |
| PROCESSING | Upload currently being processed                                                                |
| PROCESSING_FAILED | Encountered errors while processing a file in this upload                                       |
| COMPLETE | All files in the upload processed successfully                                                  |
| FAILED | Upload was pending (i.e. `status != COMPLETE`) for more than 24 hours, and was marked as failed |

## 5. Processing
Uploaded chunked files are then merged into corresponding files by the worker `process_uploads`. After each file is created from its chunks, its MD5 checksum is matched with the expected MD5 checksum (this is the second stage of checksum validation).

As files are processed successfully, the resources (chunks) associated with them are deleted.

## 6. Data Integrity
The uploaded data goes through two stages of checksum validation:
1. Validating MD5 checksum of an individual chunk before writing it to the filesystem.
2. Validating MD5 checksum of the file, once it has been processed by the worker.

## 7. Retry
1. Upon encountering retryable exceptions, the `process_uploads` worker retries itself 3 times before failing.
2. The script `manage_pending_uploads.py`, which is scheduled to run every 24 hours, looks for uploads that are pending (`status != COMPLETE`), and retries the ones which have been pending for less than 24 hours. Other uploads are marked as FAILED, and their resources are deleted. 
