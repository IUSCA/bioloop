- in project service, add this condition to when a Project gets created
```
const duplicate_datasets = await tx.dataset.findMany({
        where: {
          id: {
            in: dataset_ids,
          },
          is_duplicate: true,
        },
      });

      const error_str = `Request contains the following duplicate datasets which cannot be assigned to project: ${
        duplicate_datasets.map((ds) => ds.id).join(', ')}`;
      if (duplicate_datasets.length > 0) {
        throw new Error(error_str);
      }
      ```

---

 - carr over duplicates/notification/action-item-related related changes from the old version of the datasets route file on this machine: datasets_router_file___old.js , into the current /datasets route index.js file.
* in the old code, update it to use prisma.skip when needed

---

carry over changes needed in watch.py from watch___old.py

---

