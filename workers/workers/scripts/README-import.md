## Import from SDA Script

The import_from_sda.py will recursively download all files from specified SRC_DIR to the DEST_DIR so long as it doesn't exceed the SIZE_LIMIT.  It does so using the specified USER and KEYTAB.

## How to by example


To run the script do the following  -  Set your .env:

IMPORT_SRC_DIR='archive/2023/'
IMPORT_DEST_DIR='/N/scratch/cpauser/legacy_data'
IMPORT_SIZE_LIMIT=210000000000
IMPORT_USER=cpauser
IMPORT_KEYTAB='/N/u/cpauser/Carbonate/cpauser.keytab'

python -u -m workers.scripts.import_from_sda

This will import everything in the 'archive/2023' directory from the cpauser's SDA account using the specified keytab.  The files will land in '/N/scratch/cpauser/legacy_data'.  The script will find the folders on the SDA with files in them and iterate through each and copy each file to it's respective folder in the destination directory.  

For example if there were two folders with files in them that looked like this:


archive/2023/data_products/:
	asfdasf.tar	werqrw.tar  asdfasfww.tar
	
archive/2023/raw_data/:
	xxxx.tar	yyyyy.tar
	

The script would create two folders in /N/scratch/cpauser/legacy_data  one called data_products and one called raw_data.  It will then extract each of the tar files into a folder with it's own name.  Using the above example the first file would be extracted into:  /N/scratch/cpauser/legacy_data/asfdasf/

The only thing that should stop the script is if it reaches the size limit or if it finishes copying. 
