-- Table: public.predictions

CREATE TABLE IF NOT EXISTS public.predictions
(
    id bigint GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    active boolean NOT NULL,
    locked boolean NOT NULL,
    fighter_a character varying COLLATE pg_catalog."default" NOT NULL,
    fighter_b character varying COLLATE pg_catalog."default" NOT NULL,
    event_name character varying COLLATE pg_catalog."default" NOT NULL,
    event_date character varying COLLATE pg_catalog."default" NOT NULL,
    image_url character varying COLLATE pg_catalog."default",
    discord_message_id bigint,
    discord_channel_id bigint,
    winner character varying COLLATE pg_catalog."default",
    method character varying COLLATE pg_catalog."default",
    CONSTRAINT predictions_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

-- Table: public.users

CREATE TABLE IF NOT EXISTS public.users
(
    id bigint GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    discord_id bigint NOT NULL,
    participations integer NOT NULL DEFAULT 0,
    wins integer NOT NULL DEFAULT 0,
    CONSTRAINT users_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

-- Table: public.prediction_users

CREATE TABLE IF NOT EXISTS public.prediction_users
(
    user_id bigint NOT NULL,
    prediction_id bigint NOT NULL,
    fighter character varying COLLATE pg_catalog."default",
    method character varying COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT prediction_users_fk0 FOREIGN KEY (prediction_id)
        REFERENCES public.predictions (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT prediction_users_fk1 FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)

TABLESPACE pg_default;
