# Upload Architecture

## 1. Introduction

Bioloop allows uploading one or more files through the browser, while ensuring strict access control to prevent unauthorized access. These chunks are then merged into corresponding files through a worker.

## 2. Requirements and Limitations

Authorized users should be able to upload files directly from their web browsers. The uploaded files should be protected from unauthorized users who have access to Slate-Scratch.

Network timeouts, data corruption and other problems that arise from uploading large files must be avoided. To achieve this, our file upload architecture uploads files in chunks of 2 MB. Uploading files in chunks also gives us a more granular view into the upload state. 

Since our workers run on Colo nodes, it is convenient to upload files to Colo nodes, so they can be processed by workers, instead of uploading files to the main API server, and then transferring them to Colo nodes.

## 3. Architecture Overview

To meet the requirements outlined above, a distributed architecture is employed.

- UI Client: Users logs into the bioloop application through their web browsers and navigate to the appropriate page to initiate file uploads.
- API: This node serves the user interface and API endpoints with user and metadata stored in a PostgreSQL database but does not have direct access to the dataset files.
- Rhythm API: This node is used to trigger workflows from the UI.
- Workers: Processing of uploaded file chunks occurs on this node via a Celery task. These worker run on Colo nodes.
- Signet: An OAuth server supporting client credential flow with the appropriate scope for uploading files to create secure tokens.
- File Upload Server (Nginx): A server on the worker node which receives requests from users to upload files. Files are uploaded to this server, in chunks.
- Secure Upload API: A lightweight app hosted on the File Upload Server that validates the incoming requests (i.e. checking for the appropriate scope) to the file upload API.


## 4. The Upload

### 4.1 Logging

For each upload, information is logged to the following relational tables (PostgreSQL):
1. `upload_log` - contains metadata about the upload itself. Is linked to one or more `file_upload_log` objects.
2. `dataset_upload_log` - contains metadata specific to a dataset's upload. Is linked to one `upload_log` object, and one `dataset` object.
3. `file_upload_log` - contains metadata about a file being uploaded.

### 4.2 Steps

1. Before an upload begins, the following things happen sequentially:
   - Checksum evaluation - MD5 checksums are evaluated for each file being uploaded, as well as for each chunk per file. 
   - Any metadata associated with the upload (like the source raw data, the file type, the names/checksums/relative paths of files being uploaded, etc.), are logged into persistent storage.
2. The actual upload begins once the above steps are successful.
3. Chunks are uploaded sequentially. If a chunk upload fails, the client-side retries the upload upto 5 times before failing.
4. The client sends an HTTP request to upload a chunk to our File Upload Server, which writes the received chunk to the filesystem, after validating its checksum (this is the first stage of checksum validation).
5. After all files' chunks are uploaded successfully, the client-side makes a request to the Rhythm API to trigger the `process_dataset_upload` worker, which merges each file's uploaded chunks into the corresponding file.

### 4.3 Directory structure
The following directories on the File Upload Server are used for uploads:
1. Directory that Data Products are uploaded to:
```
upload_dir = config['paths']['DATA_PRODUCT']['upload']
```
2. The individual chunks for an uploaded file are stored in:
```
[upload_dir] / [dataset_id] / uploaded_chunks / [file_upload_log_id]`
```
Here, `dataset_id` is the unique id created for the dataset before the upload began, and `file_upload_log_id` is the unique id for the record of this file's upload.
3. Within this directory, individual chunks are named as `[file_md5]-[i]` where `i` serves as an index for this chunk among all of the file's sequentially-uploaded chunks, identifying the order of this chunk in the file. When merging a file's chunks into the corresponding file, chunks will be processed sequentially based on this index.
4. Once a file has been processed, and it's chunks have been merged into the corresponding file, the recreated file is stored at:
```
[upload_dir] / [dataset_id] / processed
```

### 4.4 Access Control

1. To verify that a user is authorized to initiate an upload, we perform role-based checking when our `/upload` API receives a request to initiate an upload. This validation cannot be performed on the secure_upload NGINX server, since we only maintain access-control data on the API server.
2. After verifying that the user is authorized to upload datasets, the client requests a Bearer token from the Signet service, and attaches it to the Authorization header before sending a request to the `/upload` API to upload a file chunk.
   - The scope included in the granted token contains the name of the file prefixed with the scope prefix `upload_file:`.
   - If the name of the file being uploaded has spaces in it, the spaces are replaced by hyphens in the granted token's scope.
3. Before the `/upload` endpoint accepts a file chunk that needs to be uploaded, it verifies that the scope contained in the Bearer token is the same as the expected scope. If these scopes do not match, the `/upload` API rejects the HTTP request.

#### Example

As an example, to upload file `my file.json`, the Bearer token that is used to call the `/upload` API file will be expected to have scope `upload_file:my-file.json`.

### 4.5 Status

The status of the upload, as well the status of each file in the upload goes through the following values:

| Status    | Description                                                                                                                                                           |
|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| UPLOADING    | Upload initiated through the browser                                                                                                                                  |
| UPLOAD_FAILED | Upload could not be completed (network errors)                                                                                                                        |
| UPLOADED | All files successfully uploaded                                                                                                                                       |
| PROCESSING | Upload currently being processed                                                                                                                                      |
| PROCESSING_FAILED | Encountered errors while processing a file in this upload                                                                                                             |
| COMPLETE | All files in the upload processed successfully                                                                                                                        |
| FAILED | Upload was failing processing (i.e. `status == PROCESSING_FAILED`) for more than 72 hours, and was therefore marked as `FAILED` and its filesystem resources deleted. |

## 5. Processing
Uploaded file chunks are merged into the corresponding file by the worker `process_dataset_upload`. After the file has been recreated from its chunks, the MD5 checksum of the recreated file is matched with the expected MD5 checksum of the file that was persisted to the database before the upload (this is the second stage of checksum validation).

After all uploaded files have been processed successfully, the resources (uploaded file chunks) associated with them are deleted.

## 6. Data Integrity
The uploaded data goes through two stages of checksum validation:
1. Validating MD5 checksum of an uploaded file chunk before writing it to the filesystem.
2. Validating MD5 checksum of the file, once it has been recreated from its chunks by the worker.

## 7. Retry
1. Upon encountering retryable exceptions, the `process_dataset_upload` worker retries itself 3 times before failing.
2. The script `manage_pending_dataset_uploads.py`, which is scheduled to run every 24 hours, looks for uploads that are failing (`status == PROCESSING_FAILED`), and retries to process the ones which have been failing for less than 72 hours. If some uploads have been failing for more than 72 hours, they are marked as `FAILED` and their filesystem resources (uploaded file chunks, and any processed files) are purged.
