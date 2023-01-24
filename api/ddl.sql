create table batch
(
    id               integer generated always as identity
        primary key,
    name             text                    not null,
    num_directories  numeric,
    num_files        numeric,
    num_genome_files numeric,
    du_size          numeric,
    size             numeric,
    description      text,
    created_at       timestamp default now() not null,
    updated_at       timestamp default now() not null,
    origin_path      text,
    archive_path     text,
    stage_path       text,
    workflow_id      text
);

alter table batch
    owner to dgluser;

create table checksum
(
    path     text not null,
    md5      text not null,
    id       integer generated always as identity
        primary key,
    batch_id integer
        constraint checksum_batch_fkey
            references batch
);

alter table checksum
    owner to dgluser;

create function trigger_set_timestamp() returns trigger
    language plpgsql
as
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END
$$;

alter function trigger_set_timestamp() owner to dgluser;

create trigger set_timestamp
    before update
    on batch
    for each row
execute procedure trigger_set_timestamp();

