--
-- PostgreSQL database dump
--

\restrict LHuai4E477TQjZf0zuB9qkOaqStPCDvKDAIT8qhL1gYNEjNnpxrIk5pcpPCxeTK

-- Dumped from database version 17.7 (178558d)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    id integer NOT NULL,
    username character varying(120) NOT NULL,
    password_hash character varying(300) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: admins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer,
    product_id integer,
    qty numeric(12,3) NOT NULL,
    rate numeric(10,2) NOT NULL,
    amount numeric(12,2) NOT NULL
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    invoice_no character varying(100) NOT NULL,
    store_id integer,
    terminal_id integer,
    total numeric(12,2) NOT NULL,
    tax numeric(12,2) DEFAULT 0,
    status character varying(30) DEFAULT 'synced'::character varying,
    idempotency_key character varying(128),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: monthly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_reports (
    id bigint NOT NULL,
    store_id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    invoice_count bigint DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: monthly_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.monthly_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monthly_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.monthly_reports_id_seq OWNED BY public.monthly_reports.id;


--
-- Name: product_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_price_history (
    id integer NOT NULL,
    product_id integer,
    old_price numeric(10,2),
    new_price numeric(10,2),
    changed_by character varying(100),
    changed_at timestamp without time zone DEFAULT now()
);


--
-- Name: product_price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_price_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_price_history_id_seq OWNED BY public.product_price_history.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    sku character varying(100),
    name character varying(300) NOT NULL,
    unit character varying(50),
    price numeric(10,2) DEFAULT 0 NOT NULL,
    stock numeric(12,3) DEFAULT 0,
    store_id integer,
    updated_at timestamp without time zone DEFAULT now(),
    deleted_at timestamp without time zone,
    allow_decimal_qty boolean
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    store_id integer,
    token character varying(200) NOT NULL,
    terminal_uuid character varying(200),
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: store_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_credentials (
    id integer NOT NULL,
    store_id integer,
    username character varying(120) NOT NULL,
    password_hash character varying(300) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: store_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_credentials_id_seq OWNED BY public.store_credentials.id;


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: stores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stores_id_seq OWNED BY public.stores.id;


--
-- Name: terminals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terminals (
    id integer NOT NULL,
    store_id integer,
    terminal_uuid character varying(100) NOT NULL,
    label character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.terminals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: terminals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.terminals_id_seq OWNED BY public.terminals.id;


--
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: monthly_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_reports ALTER COLUMN id SET DEFAULT nextval('public.monthly_reports_id_seq'::regclass);


--
-- Name: product_price_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_history ALTER COLUMN id SET DEFAULT nextval('public.product_price_history_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: store_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credentials ALTER COLUMN id SET DEFAULT nextval('public.store_credentials_id_seq'::regclass);


--
-- Name: stores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores ALTER COLUMN id SET DEFAULT nextval('public.stores_id_seq'::regclass);


--
-- Name: terminals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminals ALTER COLUMN id SET DEFAULT nextval('public.terminals_id_seq'::regclass);


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admins (id, username, password_hash, created_at) FROM stdin;
5	admin	$2a$06$bO2bvCwNfUfWCwvjxdKZFukLbzG8KC9d7TmHYUHKGs2DV3eb3hEPS	2025-12-08 08:20:57.633266
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_items (id, invoice_id, product_id, qty, rate, amount) FROM stdin;
141	87	36	2.000	20.00	40.00
142	88	38	2.761	40.00	110.44
143	89	30	3.000	50.00	150.00
144	90	30	2.000	50.00	100.00
145	90	33	1.611	200.00	322.20
146	91	41	1.420	50.00	71.00
147	92	41	4.000	50.00	200.00
148	93	41	1.000	50.00	50.00
149	94	40	2.076	5.00	10.38
150	94	33	1.896	200.00	379.20
151	95	30	1.000	20.00	20.00
152	96	35	2.120	20.00	42.40
153	97	30	3.000	20.00	60.00
154	97	33	0.959	200.00	191.80
155	97	32	4.000	10.00	40.00
156	98	40	1.097	5.00	5.48
157	98	41	3.000	50.00	150.00
158	98	32	2.000	10.00	20.00
159	99	32	2.000	10.00	20.00
160	100	32	2.000	10.00	20.00
161	101	41	3.000	50.00	150.00
162	102	41	3.000	50.00	150.00
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (id, invoice_no, store_id, terminal_id, total, tax, status, idempotency_key, created_at) FROM stdin;
88	INV-1765196900223	1	7	110.44	0.00	voided	web-1765196900031	2025-12-08 12:28:20.224133
87	INV-1765180884822	1	7	40.00	0.00	voided	web-1765180884564	2025-12-08 08:01:24.804494
90	INV-1765242655985	1	7	422.20	0.00	voided	web-1765242655785	2025-12-09 06:40:55.969246
89	INV-1765234026048	1	7	150.00	0.00	voided	web-1765234025861	2025-12-08 22:47:06.073311
92	INV-1765250146781	1	7	200.00	0.00	voided	web-1765250146443	2025-12-09 03:15:46.764075
91	INV-1765250114880	1	7	71.00	0.00	voided	web-1765250114640	2025-12-09 03:15:14.914133
93	INV-1765275792676	1	7	50.00	0.00	voided	web-1765275792480	2025-12-09 10:23:12.68536
94	INV-1765281702321	1	7	389.58	0.00	synced	web-1765281414417	2025-12-09 12:01:42.339751
95	INV-1765281704365	1	7	20.00	0.00	synced	web-1765281418997	2025-12-09 12:01:44.128533
96	INV-1765281705558	1	7	42.40	0.00	voided	web-1765281430314	2025-12-09 12:01:45.58533
97	INV-1765293978291	1	7	291.80	0.00	synced	web-1765293977891	2025-12-09 15:26:18.170493
98	INV-1765294012427	1	7	175.48	0.00	synced	web-1765294012013	2025-12-09 15:26:52.295266
99	INV-1765327878473	1	7	20.00	0.00	synced	web-1765294095715	2025-12-10 00:51:18.412977
100	INV-1765327878732	1	7	20.00	0.00	synced	web-1765294095715	2025-12-10 00:51:18.417478
102	INV-1765327879222	1	7	150.00	0.00	voided	web-1765294107556	2025-12-10 00:51:19.16141
101	INV-1765327878976	1	7	150.00	0.00	voided	web-1765294107556	2025-12-10 00:51:18.914617
\.


--
-- Data for Name: monthly_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.monthly_reports (id, store_id, year, month, invoice_count, subtotal, tax, total, created_at, updated_at) FROM stdin;
1	1	2025	12	6	916.86	0.00	916.86	2025-12-07 23:55:32.698471+00	2025-12-10 00:59:13.05682+00
\.


--
-- Data for Name: product_price_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_price_history (id, product_id, old_price, new_price, changed_by, changed_at) FROM stdin;
1	1	30.00	35.50	admin_raksh	2025-12-04 02:58:38.064984
2	1	35.50	36.00	admin	2025-12-04 03:00:53.560022
3	2	25.00	29.00	admin	2025-12-04 03:00:53.560022
4	1	33.50	99.99	admin	2025-12-04 08:37:27.138462
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, sku, name, unit, price, stock, store_id, updated_at, deleted_at, allow_decimal_qty) FROM stdin;
23	QK-1765022825835	packet	kg	10.00	0.000	1	2025-12-06 12:27:26.380169	2025-12-06 12:27:26.380169	t
12	QK-1765019269892	Carrot	kg	20.00	20.000	1	2025-12-06 12:27:11.958203	2025-12-06 12:27:11.958203	t
18	manual-1765020878335	Cabbage	kg	10.00	10.000	1	2025-12-06 12:27:13.31437	2025-12-06 12:27:13.31437	t
9	QK-1765018796293	Apple	kg	120.00	0.000	1	2025-12-06 12:27:07.506249	2025-12-06 12:27:07.506249	t
22	manual-1765021440026	corn	kg	10.00	0.000	1	2025-12-06 12:27:22.226331	2025-12-06 12:27:22.226331	t
37	QK-1765097670161	onion	kg	10.00	-0.888	1	2025-12-07 12:49:47.630246	\N	t
19	QK-1765020909382	water bottle	kg	10.00	100.000	1	2025-12-06 12:27:23.594824	2025-12-06 12:27:23.594824	t
26	QK-1765023064818	error	kg	10.00	0.000	1	2025-12-06 12:27:28.241807	2025-12-06 12:27:28.241807	t
28	manual-1765024056274	Pen	kg	10.00	0.000	1	2025-12-06 12:28:07.902828	2025-12-06 12:28:07.902828	t
29	QK-1765024072209	pencil	qty	10.00	0.000	1	2025-12-06 12:28:29.507168	2025-12-06 12:28:29.507168	f
27	QK-1765023971038	pencil	qty	10.00	0.000	1	2025-12-06 12:27:31.450617	2025-12-06 12:27:31.450617	f
11	QK-1765019195456	Tomato	kg	100.00	10.000	1	2025-12-06 12:27:17.507481	2025-12-06 12:27:17.507481	t
20	QK-1765020960863	beans	kg	50.00	100.000	1	2025-12-06 12:27:15.625238	2025-12-06 12:27:15.625238	t
13	QK-1765019763158	Banana	kg	5.00	100.000	1	2025-12-06 12:27:19.172364	2025-12-06 12:27:19.172364	t
10	manual-1765019165433	Coriander	kg	10.00	10.000	1	2025-12-06 12:27:10.709451	2025-12-06 12:27:10.709451	t
4	TST-NEW	Test New Item	kg	12.50	34.134	1	2025-12-06 10:48:17.573623	2025-12-06 10:48:17.573623	t
3	ONI-1KG	Onion (1kg)	kg	50.00	46.495	1	2025-12-06 10:48:27.451955	2025-12-06 10:48:27.451955	t
5	manual-1765009574530	carrot	kg	10.00	10.000	1	2025-12-06 10:48:30.019985	2025-12-06 10:48:30.019985	t
6	manual-1765009599403	Tomato	kg	10.00	100.000	1	2025-12-06 10:48:31.584013	2025-12-06 10:48:31.584013	t
7	QK-1765017978090	coriander	kg	10.00	197.038	1	2025-12-06 10:48:33.102699	2025-12-06 10:48:33.102699	t
8	QK-1765018746250	Apple	kg	100.00	0.000	1	2025-12-06 11:05:53.289189	2025-12-06 11:05:53.289189	t
14	QK-1765020303277	a	kg	0.00	0.000	1	2025-12-06 11:33:33.854087	2025-12-06 11:33:33.854087	t
15	QK-1765020513292	abcd	kg	0.00	0.000	1	2025-12-06 11:33:35.336989	2025-12-06 11:33:35.336989	t
16	QK-1765020789743	xyz	kg	10.00	10.000	1	2025-12-06 11:33:37.325482	2025-12-06 11:33:37.325482	t
17	QK-1765020845865	cabbage	kg	30.00	10.000	1	2025-12-06 11:34:28.082188	2025-12-06 11:34:28.082188	t
21	manual-1765021396489	corn	kg	10.00	10.000	1	2025-12-06 11:43:55.562797	2025-12-06 11:43:55.562797	t
1	TOM-1KG-NEW	Tomato (1kg)	kg	99.99	103.932	1	2025-12-06 08:22:47.836554	2025-12-06 08:22:47.836554	t
2	POT-1KG	Potato - 1kg (A Grade)	kg	29.00	84.650	1	2025-12-06 08:26:24.408227	2025-12-06 08:26:24.408227	t
34	QK-1765087157311	Pudina	qty	20.00	100.000	1	2025-12-07 05:59:58.153653	\N	f
25	QK-1765022987536	tgtrghyjffed rfrfgyhb gtrftrgbhun rtf6thy7j t6g7y	kg	90.00	0.000	1	2025-12-06 12:27:29.663768	2025-12-06 12:27:29.663768	t
24	QK-1765022884088	Pen	kg	10.00	0.000	1	2025-12-06 12:27:24.901013	2025-12-06 12:27:24.901013	t
35	manual-1765087323207	Onion	kg	20.00	100.000	1	2025-12-09 12:01:45.58533	\N	t
30	QK-1765024118874	Bread (old stock)	qty	20.00	87.000	1	2025-12-09 15:26:18.170493	\N	f
33	QK-1765024852342	Carrot	kg	200.00	-4.459	1	2025-12-09 15:26:18.170493	\N	t
31	QK-1765024684194	Tomato	kg	10.00	-4.183	1	2025-12-07 23:56:49.263628	\N	t
40	manual-1765242717220	Beans	kg	5.00	-3.173	1	2025-12-09 15:26:52.295266	\N	t
38	QK-1765097782666	Tomoto (nati)	kg	40.00	100.000	1	2025-12-08 12:28:20.224133	\N	t
36	QK-1765097399243	Coriander	qty	20.00	200.000	1	2025-12-08 08:01:24.804494	\N	f
39	QK-1765200010730	carrot	kg	10.00	0.000	6	2025-12-08 18:50:10.894539	\N	t
32	manual-1765024715561	Pen	qty	10.00	-21.000	1	2025-12-10 00:51:18.417478	\N	f
42	manual-1765328054402	abc	kg	20.00	0.000	1	2025-12-10 06:24:21.652803	2025-12-10 06:24:21.652803	t
43	QK-1765328307551	abc	kg	10.00	10.000	1	2025-12-10 06:28:40.518141	2025-12-10 06:28:40.518141	t
44	QK-1765328332423	test	qty	10.00	0.000	1	2025-12-10 00:58:59.217634	2025-12-10 00:58:59.217634	f
41	manual-1765243096666	Bread (new)	qty	50.00	-1.580	1	2025-12-10 00:51:19.16141	\N	f
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (id, store_id, token, terminal_uuid, created_at, expires_at) FROM stdin;
1	1	ec5b08d4-5279-459f-8c8b-089c6fd44e4f	term-pc-01	2025-12-04 02:47:09.446154	2026-12-04 02:47:09.226
2	\N	340d255c-9d8b-45bd-86cb-9286b96b731c	admin:1	2025-12-04 08:05:34.952374	2025-12-11 08:05:34.783
3	\N	a11ddaf8-85d3-47d2-a006-0315d6c31298	admin:1	2025-12-04 08:22:07.00323	2025-12-11 08:22:06.849
4	\N	4cee4874-4cce-4478-a9b2-b9ed31d4c244	admin:1	2025-12-04 08:36:09.613599	2025-12-11 08:36:09.47
5	1	155a400e-3c5d-4b3d-ac52-a768e09349c6	term-web-01	2025-12-04 09:08:06.991249	2026-12-04 09:08:06.848
6	1	019b01f5-6198-4925-8794-2d1778e68be2	term-web-01	2025-12-04 11:40:42.168007	2026-12-04 11:40:42.027
7	1	0d77679c-1707-4ee0-b6e8-cfdfa0383cad	term-web-01	2025-12-04 11:43:28.794871	2026-12-04 11:43:28.653
8	1	47276a2f-df69-4725-8413-ddb13957622d	term-web-01	2025-12-04 23:42:07.848116	2026-12-04 23:42:07.704
9	1	55a6981e-66d2-49f0-99bb-7e5c7b27f16a	term-web-01	2025-12-05 00:21:48.681927	2026-12-05 00:21:48.567
10	1	d2e2655a-c071-4097-895f-8f7869a5a17c	term-web-01	2025-12-05 00:34:26.42887	2026-12-05 00:34:26.315
11	1	b293998e-144f-4e8c-80ce-569fbc3c3dee	term-web-01	2025-12-05 00:34:54.058275	2026-12-05 00:34:53.946
12	1	eee83c48-92ad-4a45-8a42-5b78b82cbeeb	term-web-01	2025-12-05 00:44:42.458372	2026-12-05 00:44:42.349
13	1	4fd206e2-b69b-4702-8d17-abfed79b3d0f	term-web-01	2025-12-05 09:35:03.877853	2026-12-05 09:35:03.811
14	1	e5705cd0-ad36-45c0-8beb-65d3ee4cb283	term-web-01	2025-12-05 09:56:10.249718	2026-12-05 09:56:10.193
15	1	779daf4c-c5e8-4080-a071-f0811e3e25bc	term-web-01	2025-12-05 11:46:30.861691	2026-12-05 11:46:30.62
16	1	5cedbc44-89e0-4546-b866-db57e03c0dc3	term-web-01	2025-12-06 14:33:14.141784	2026-12-06 14:33:13.962
17	\N	4ebde470-e3b6-4ff0-8e38-44b46f58c99a	admin:1	2025-12-07 01:19:46.107137	2025-12-14 01:19:45.92
18	\N	83114ce9-bba3-4be9-852b-5157691587df	admin:1	2025-12-07 01:33:12.325525	2025-12-14 01:33:12.136
19	\N	21fad49d-fe62-49c3-8f4b-2ec35ab89be3	admin:1	2025-12-07 01:37:32.115826	2025-12-14 01:37:31.925
20	\N	2b6ee90c-e3cf-4a4a-904e-973dbf5cbfa0	admin:1	2025-12-07 02:18:23.671572	2025-12-14 02:18:23.499
21	\N	4d4cc5f5-047e-403f-a174-06fd83bacfe9	admin:1	2025-12-07 02:28:19.126564	2025-12-14 02:28:18.946
22	\N	35b3a417-ffde-48c8-b695-6e6e4571e596	admin:1	2025-12-07 02:31:37.162112	2025-12-14 02:31:36.98
23	1	5c88e59a-4751-41f0-a3ff-35fdd7348c93	term-web-01	2025-12-07 02:40:37.922585	2026-12-07 02:40:37.746
24	1	8a0dee15-ee96-4061-9fb7-18565ac4265f	term-web-01	2025-12-07 02:41:01.949477	2026-12-07 02:41:01.773
25	\N	41252c99-a978-40de-b0c2-6d33ffc70d94	admin:1	2025-12-07 02:43:06.468121	2025-12-14 02:43:06.289
26	1	4c61ecc7-715c-40f2-b24b-2f5f82e829f0	term-web-01	2025-12-07 02:55:31.822848	2026-12-07 02:55:31.65
27	\N	c00d2a38-33f5-42b2-a25e-8856339cac03	admin:1	2025-12-07 03:00:50.012605	2025-12-14 03:00:49.841
28	1	99d22be8-eac7-4a6e-8591-572cd756310b	term-web-01	2025-12-07 05:58:47.654029	2026-12-07 05:58:47.526
29	\N	6e72b2a0-ee53-49b7-b76b-e66d42a1a421	admin:1	2025-12-07 06:03:14.094231	2025-12-14 06:03:13.965
30	1	ec219b37-bd75-4d92-8821-24117b7b84ef	term-web-01	2025-12-07 08:49:32.811905	2026-12-07 08:49:32.655
31	\N	4b2a7190-984f-412f-a7ea-38e0270bd7a6	admin:1	2025-12-07 08:53:05.111246	2025-12-14 08:53:04.912
32	\N	a9a18087-93a8-4caa-a2ab-66de663c19af	admin:1	2025-12-07 09:01:21.536686	2025-12-14 09:01:21.39
33	1	b60a4aa0-a61d-4614-94e6-1dd93de2123a	term-web-01	2025-12-07 12:29:54.485884	2026-12-07 12:29:54.284
34	\N	aa0af5bb-2295-46ad-aece-6c9b2d40d87f	admin:1	2025-12-07 13:18:19.004351	2025-12-14 13:18:18.846
35	\N	8d30482f-d03a-4350-956b-2131718f79c9	admin:1	2025-12-07 14:38:18.827706	2025-12-14 14:38:18.669
36	\N	73b63f53-c363-4756-8315-f4115aa4b3d6	admin:5	2025-12-08 08:21:28.717498	2025-12-15 08:21:28.659
37	\N	6d52f46f-935c-492d-9678-425697c691e9	admin:5	2025-12-08 13:55:21.143534	2025-12-15 08:25:21.088
38	1	1e9a365c-404b-410c-8baa-6a2c7fae322f	term-web-01	2025-12-08 09:26:31.314395	2026-12-08 09:26:31.301
39	\N	5f139dab-d4cb-4744-9bc4-65850d48e670	admin:5	2025-12-08 09:26:47.903206	2025-12-15 09:26:47.889
40	\N	a2c6eff5-34ee-4839-991f-7414d2d950eb	admin:5	2025-12-08 11:25:23.162048	2025-12-15 11:25:23.024
41	\N	2ed583ce-7afa-4774-bc5f-d6a001168379	admin:5	2025-12-08 11:25:24.958427	2025-12-15 11:25:24.82
42	\N	c7eb2004-5ef6-476c-bf2d-84614fe5d685	admin:5	2025-12-08 11:25:39.073434	2025-12-15 11:25:38.936
43	\N	64f50a6a-9f4b-4190-8777-7cb6d60c80fe	admin:5	2025-12-08 11:25:42.867788	2025-12-15 11:25:42.73
44	\N	cfe813ca-18ea-467b-a656-9fc61952a424	admin:5	2025-12-08 11:26:23.268532	2025-12-15 11:26:23.13
45	\N	a16fd4ab-88a7-481c-a3ab-4acbf1e0f6a1	admin:5	2025-12-08 11:26:39.590454	2025-12-15 11:26:39.452
46	\N	d879ee39-55ed-43fc-9bb0-7eb5c12682ee	admin:5	2025-12-08 11:26:40.760954	2025-12-15 11:26:40.622
47	\N	809e9c34-904c-4f7a-adaa-5aaa40351147	admin:5	2025-12-08 11:26:41.69694	2025-12-15 11:26:41.558
48	\N	f54bd51c-0bd0-4b1c-bb2f-c0e533f39d23	admin:5	2025-12-08 11:35:59.387406	2025-12-15 11:35:59.031
49	1	64cb7d88-d5dd-4dca-b3c0-204a94fe8930	term-web-01	2025-12-08 11:35:59.583684	2026-12-08 11:35:59.246
50	\N	3413cfae-c0e0-4981-8829-29eec584e32b	admin:5	2025-12-08 11:36:20.319084	2025-12-15 11:36:20.173
51	\N	4d375dd2-4fc4-4eff-ba1e-49bed5088fb6	admin:5	2025-12-08 11:45:36.854212	2025-12-15 11:45:36.751
52	1	0aaca6db-d5b8-4ee3-9d35-163d43e2333e	term-web-01	2025-12-08 11:45:47.404767	2026-12-08 11:45:47.302
53	\N	6fa9abe8-f8c4-4784-afc6-39c6abe73a2d	admin:5	2025-12-08 11:51:19.417685	2025-12-15 11:51:19.313
54	1	7daca14b-ea4f-4f5d-8d85-1c47e94dc52b	term-web-01	2025-12-08 12:27:28.108877	2026-12-08 12:27:28.017
55	1	d781a76a-211d-425c-af72-7c1b55519a5c	term-web-01	2025-12-08 18:07:18.525046	2026-12-08 12:37:18.471
56	\N	7e50b73d-e7f1-4e73-8c95-21ccf9889b60	admin:5	2025-12-08 12:37:32.155596	2025-12-15 12:37:32.1
57	1	5a48ef60-3e5e-4519-8a27-eabc0181b326	term-web-01	2025-12-08 12:38:20.176631	2026-12-08 12:38:20.122
58	\N	c56ed398-32e6-4cf0-9181-9886e1201a35	admin:5	2025-12-08 12:38:52.265677	2025-12-15 12:38:52.212
59	1	930fba0f-5fa5-4ff7-91b9-183083054c08	term-web-01	2025-12-08 12:43:40.840597	2026-12-08 12:43:40.786
60	\N	f433b0b3-8085-4f47-8693-14b0c8b5db94	admin:5	2025-12-08 12:43:56.981689	2025-12-15 12:43:56.929
61	\N	a1ee8514-d674-4970-994f-b70281c1d61d	admin:5	2025-12-08 12:44:21.120133	2025-12-15 12:44:21.067
62	1	9cbeb9bb-0453-464e-9084-fb612542cb87	term-web-01	2025-12-08 12:44:48.235139	2026-12-08 12:44:48.183
63	\N	ef9886ca-cc1a-4c1d-9355-d5c0762a5dd6	admin:5	2025-12-08 12:50:48.100687	2025-12-15 12:50:48.049
64	\N	681ed5e3-6a1f-44e7-892c-40d073ccf0ea	admin:5	2025-12-08 12:58:21.379927	2025-12-15 12:58:21.338
65	1	a38c69ae-934b-405d-803e-efd6465ca726	term-web-01	2025-12-08 12:58:36.516112	2026-12-08 12:58:36.474
66	\N	977cbb4c-d1f6-4a90-bda6-8613bfbacd2a	admin:5	2025-12-08 12:59:02.947816	2025-12-15 12:59:02.906
67	2	7c2035e6-e715-432d-b5a6-37fd42e597d3	term-web-01	2025-12-08 13:02:00.067673	2026-12-08 13:02:00.028
68	2	59f3f577-48bd-4fed-9b17-4a3f4d9c173f	term-web-01	2025-12-08 13:02:15.163064	2026-12-08 13:02:15.122
69	3	a9e7f111-412f-498d-9200-f3f7932964ca	term-web-01	2025-12-08 13:02:21.791833	2026-12-08 13:02:21.751
70	4	3bdbfe02-74a9-426d-9a40-465a0069c4e6	term-web-01	2025-12-08 13:02:30.321623	2026-12-08 13:02:30.281
71	6	82b87116-82bf-4b40-93d5-379879215dda	term-web-01	2025-12-08 13:02:37.545832	2026-12-08 13:02:37.505
72	6	0f2c3e4a-f784-40c2-88ac-27f578da8f6b	term-web-01	2025-12-08 13:07:20.759496	2026-12-08 13:07:20.721
73	1	8f3f310d-a4a4-4e3b-9b02-8c2e3ef88b51	term-web-01	2025-12-08 18:50:24.408869	2026-12-08 13:20:24.374
74	6	1e7e65af-886b-4476-934b-c140b9fcff3f	term-web-01	2025-12-08 18:50:33.253823	2026-12-08 13:20:33.219
75	1	a1a9466a-d85c-4d0b-ad9d-d89a9f4bd13e	term-web-01	2025-12-08 22:46:42.002185	2026-12-08 22:46:41.887
76	2	1f4b360a-333f-4bdc-9c2b-0c8f2f62ae30	term-web-01	2025-12-08 22:47:22.628637	2026-12-08 22:47:22.512
77	\N	25eed449-4c79-43ec-86cc-429032d58f5c	admin:5	2025-12-08 22:47:50.226116	2025-12-15 22:47:50.108
78	\N	f56e6c56-c526-4737-905d-89bba6a8b139	admin:5	2025-12-09 04:50:06.974507	2025-12-15 23:20:06.857
79	1	d9bb4a3f-ac9a-4208-be60-15a380accc18	admin-impersonate-store-1	2025-12-08 23:20:24.420448	2025-12-09 23:20:24.303
80	\N	1dff0418-e823-46d7-abef-aeb44126560d	admin:5	2025-12-08 23:20:41.148981	2025-12-15 23:20:41.031
81	1	c949688c-77c8-4d67-bdad-c495248517c0	admin-impersonate-store-1	2025-12-08 23:20:43.671994	2025-12-09 23:20:43.555
82	\N	9c45c887-02a3-416f-bad8-8a73e898b310	admin:5	2025-12-09 05:21:33.364405	2025-12-15 23:51:33.275
83	1	55412972-946a-430b-bb28-3eead1cf14db	admin-impersonate-store-1	2025-12-09 05:21:35.695555	2025-12-09 23:51:35.597
84	\N	790e4eda-9504-44e4-952f-1386d5df7c49	admin:5	2025-12-09 05:24:50.877771	2025-12-15 23:54:50.808
85	1	64d8b324-5c0f-48f2-8197-dd1599360a41	admin-impersonate-store-1	2025-12-09 05:24:52.155495	2025-12-09 23:54:52.083
86	\N	44ba26cc-01f6-489e-afe0-968e268c28eb	admin:5	2025-12-08 23:55:01.123441	2025-12-15 23:55:01.052
87	2	7a538839-a770-480f-bfa6-011a3153c29a	admin-impersonate-store-2	2025-12-09 05:25:03.955832	2025-12-09 23:55:03.884
88	2	139fe6d1-9761-49bc-809a-aadc01c31488	admin-impersonate-store-2	2025-12-09 05:33:38.335528	2025-12-10 00:03:38.267
89	2	652897f3-97ad-4651-8cd1-ab50476bcdaf	admin-impersonate-store-2	2025-12-09 05:33:44.320911	2025-12-10 00:03:44.254
90	1	4fc6cbce-32f2-4bc0-b6b7-7c23dc9afd5b	admin-impersonate-store-1	2025-12-09 05:33:50.932782	2025-12-10 00:03:50.865
91	2	9f773a65-c0cf-4991-ab41-661874104a31	admin-impersonate-store-2	2025-12-09 00:21:48.555088	2025-12-10 00:21:48.508
92	3	3914e03e-410a-41e2-b846-3bf91abfe331	admin-impersonate-store-3	2025-12-09 00:21:53.774488	2025-12-10 00:21:53.728
93	1	27b5e19e-0727-4895-977c-c305aeb0d276	admin-impersonate-store-1	2025-12-09 00:21:57.491581	2025-12-10 00:21:57.444
94	1	0f8b5204-a536-4ae6-93c5-464e4f7bd67d	admin-impersonate-store-1	2025-12-09 00:21:59.875969	2025-12-10 00:21:59.829
95	2	31c15241-6e9e-4d4b-83ed-838d0aaf60cd	admin-impersonate-store-2	2025-12-09 00:22:02.822635	2025-12-10 00:22:02.776
96	4	d75f65db-0ef8-459f-9729-bcb8fb83e480	admin-impersonate-store-4	2025-12-09 00:22:08.522353	2025-12-10 00:22:08.475
97	1	16b14264-adef-4a96-a4ce-0ecbcbda02fa	admin-impersonate-store-1	2025-12-09 05:57:51.172462	2025-12-10 00:27:51.129
98	1	dff31d7d-ccbd-44bf-bdcc-d0383aa76208	admin-impersonate-store-1	2025-12-09 00:27:57.098262	2025-12-10 00:27:57.055
99	3	e72c9b51-d65f-4082-bbd0-695015ee04b4	admin-impersonate-store-3	2025-12-09 00:27:59.708248	2025-12-10 00:27:59.667
100	1	2663bccd-bf9d-44cd-8203-404a7f62005c	term-web-01	2025-12-09 06:39:42.911808	2026-12-09 01:09:42.831
101	\N	5451d61a-bbf3-45df-8972-75a4d296548c	admin:5	2025-12-09 01:13:10.07733	2025-12-16 01:13:09.998
102	1	2957d094-16e7-4fa5-bc44-c334e3f089cb	term-web-01	2025-12-09 01:13:26.931714	2026-12-09 01:13:26.852
103	\N	b7ffcd5e-8c48-456d-99a8-8e8a8a94dd1b	admin:5	2025-12-09 01:14:51.28014	2025-12-16 01:14:51.2
104	1	c68acf94-5739-4e48-9e1b-0319a7ac27c0	admin-impersonate-store-1	2025-12-09 01:15:05.534816	2025-12-10 01:15:05.454
105	2	c53bae25-e290-4575-8550-27116ddf46dd	admin-impersonate-store-2	2025-12-09 01:15:10.151555	2025-12-10 01:15:10.072
106	1	0ab92f65-f863-451f-a527-c81f2e67fea7	term-web-01	2025-12-09 01:15:42.173728	2026-12-09 01:15:42.094
107	1	08e1e701-cebf-4e0a-9745-da1cc8805396	term-web-01	2025-12-09 01:46:56.653791	2026-12-09 01:46:56.569
108	\N	418ec2df-00fa-4593-b1a1-bee8c7412d5e	admin:5	2025-12-09 01:47:14.931904	2025-12-16 01:47:14.847
109	1	ed1bce82-cb41-4c4b-9e17-6d603add8c51	admin-impersonate-store-1	2025-12-09 01:47:18.700974	2025-12-10 01:47:18.617
110	\N	0d47383a-8827-4b6e-a054-32acd12f3b3e	admin:5	2025-12-09 07:18:34.502105	2025-12-16 01:48:34.416
111	1	e0e65bb0-30cd-4168-b6d6-f6076d81efce	term-web-01	2025-12-09 01:56:52.656034	2026-12-09 01:56:52.57
112	\N	a974774d-5542-4097-ac24-20681f67f23e	admin:5	2025-12-09 01:57:02.0097	2025-12-16 01:57:01.924
113	1	bf414dae-0648-4f0a-8cd5-4014ab4ddbfa	admin-impersonate-store-1	2025-12-09 01:57:04.453683	2025-12-10 01:57:04.367
114	3	28df95cb-2e51-42ca-b62b-0a4f2ecaa63c	admin-impersonate-store-3	2025-12-09 01:57:09.036056	2025-12-10 01:57:08.95
115	1	7b44499a-2023-4bd0-925a-4c9354b33ff8	term-web-01	2025-12-09 01:59:21.370506	2026-12-09 01:59:21.285
116	\N	6a240ced-edfa-4c10-b9f3-5249f57b7948	admin:5	2025-12-09 01:59:30.048962	2025-12-16 01:59:29.958
117	1	a38eaf95-6040-4f73-b325-ed761d6a5fe5	term-web-01	2025-12-09 01:59:38.444233	2026-12-09 01:59:38.358
118	\N	1966a493-60db-49e7-9bdd-947246020703	admin:5	2025-12-09 01:59:51.245895	2025-12-16 01:59:51.16
119	\N	34b4c72b-a503-46fd-b92c-2b849695f538	admin:5	2025-12-09 02:00:01.053655	2025-12-16 02:00:00.975
120	1	2b2f8c90-883f-4473-9a72-770d379d41bc	admin-impersonate-store-1	2025-12-09 02:00:02.724035	2025-12-10 02:00:02.646
121	2	b4ead494-1133-4381-bf76-43b0598ba831	admin-impersonate-store-2	2025-12-09 02:00:07.057153	2025-12-10 02:00:06.982
122	1	81fce4bb-c408-4969-ad9d-0cb8e52e42ea	admin-impersonate-store-1	2025-12-09 07:39:09.746406	2025-12-10 02:09:09.68
123	\N	f4e6bc5f-ec6a-4ac6-8ca4-4aea44635c9f	admin:5	2025-12-09 02:10:06.755484	2025-12-16 02:10:06.69
124	1	46c82bfd-5008-4d82-af9d-0e8067362c18	admin-impersonate-store-1	2025-12-09 02:10:10.699137	2025-12-10 02:10:10.632
125	\N	13e541c6-8d3e-4237-870b-8c31c18ae25d	admin:5	2025-12-09 02:14:31.263087	2025-12-16 02:14:31.194
126	2	04a9969e-830a-4807-a09b-0a25c96847bd	admin-impersonate-store-2	2025-12-09 02:14:34.575972	2025-12-10 02:14:34.509
127	\N	541087fc-a33d-4e06-a97b-f7bff7fc0f75	admin:5	2025-12-09 07:52:41.336801	2025-12-16 02:22:41.235
128	1	0a66980f-ebf5-41c1-b29a-3f21d7dc5cfa	admin-impersonate-store-1	2025-12-09 07:52:46.528383	2025-12-10 02:22:46.427
129	\N	47f0d273-8b5e-4138-bbcc-ccce028e9d74	admin:5	2025-12-09 07:52:55.970698	2025-12-16 02:22:55.867
130	3	740c848e-a7a1-4275-9879-8f432d454167	admin-impersonate-store-3	2025-12-09 02:22:58.182087	2025-12-10 02:22:58.08
131	\N	c09a0be8-81df-4bae-b18a-653525903d24	admin:5	2025-12-09 02:23:38.885545	2025-12-16 02:23:38.784
132	1	3fcb3016-34e2-460f-ab89-bc7400c3e6d7	admin-impersonate-store-1	2025-12-09 02:28:46.302287	2025-12-10 02:28:46.198
133	\N	3d327c36-5f6d-4b71-9d3a-f66462a12f83	admin:5	2025-12-09 02:28:55.436299	2025-12-16 02:28:55.332
134	2	3b7a92fe-d7fb-47fa-bb6f-56267520312e	admin-impersonate-store-2	2025-12-09 02:28:59.084887	2025-12-10 02:28:58.98
135	\N	a4825e99-495d-4870-90b2-da13959b28ce	admin:5	2025-12-09 02:29:07.339046	2025-12-16 02:29:07.234
136	4	0a1c501c-a302-4cb1-815d-0de08c1b4d4b	admin-impersonate-store-4	2025-12-09 02:29:08.832142	2025-12-10 02:29:08.727
137	\N	0421d96e-e7b7-4d6a-920f-62472d43b967	admin:5	2025-12-09 02:29:15.935054	2025-12-16 02:29:15.83
138	6	49c3ac85-97f9-4d0b-91bd-9d30a1561c3f	admin-impersonate-store-6	2025-12-09 02:29:18.626071	2025-12-10 02:29:18.522
139	\N	6fea1b1e-33ec-4f62-8832-1c003b25f51f	admin:5	2025-12-09 02:31:34.368616	2025-12-16 02:31:34.263
140	1	f10cc1b1-d991-45f5-831d-1f49c9c91cb7	admin-impersonate-store-1	2025-12-09 02:31:35.95261	2025-12-10 02:31:35.846
141	1	b8edab37-de5b-4d5f-a4bb-1f0d0019eacd	term-web-01	2025-12-09 02:31:54.394311	2026-12-09 02:31:54.258
142	\N	6e399b9f-d4ae-4c85-a96b-8dbccc4c8b11	admin:5	2025-12-09 02:32:08.214931	2025-12-16 02:32:08.11
143	1	bd23227b-e5e1-4fa2-964d-51c1ede651a7	admin-impersonate-store-1	2025-12-09 02:37:25.827059	2025-12-10 02:37:25.718
144	\N	eae56073-74fe-491a-9f8f-faaa79638d38	admin:5	2025-12-09 02:37:38.570815	2025-12-16 02:37:38.461
145	6	528b6392-fc29-4d03-9374-cb64630fe106	admin-impersonate-store-6	2025-12-09 02:37:43.698807	2025-12-10 02:37:43.592
146	\N	da0172c3-be89-477b-82b0-b7ad1f20390d	admin:5	2025-12-09 02:38:33.143309	2025-12-16 02:38:33.035
147	6	831d0803-ed14-4984-9d97-744e386b3397	admin-impersonate-store-6	2025-12-09 02:38:37.285501	2025-12-10 02:38:37.178
148	\N	ceb1cc1e-2bfd-4685-add0-84beac1f47ed	admin:5	2025-12-09 02:43:53.894232	2025-12-16 02:43:53.785
149	1	205610d2-3d26-436c-8469-430f8cced09a	admin-impersonate-store-1	2025-12-09 02:43:55.499577	2025-12-10 02:43:55.39
150	\N	cf01747a-28d0-4580-b7a1-200a534a3419	admin:5	2025-12-09 02:44:03.773566	2025-12-16 02:44:03.664
151	6	f19b7278-f771-4b32-b6e5-0848f961176c	admin-impersonate-store-6	2025-12-09 02:44:08.81218	2025-12-10 02:44:08.703
152	\N	e36de930-3821-475f-8d4e-7a879fb48a83	admin:5	2025-12-09 02:44:15.955635	2025-12-16 02:44:15.845
153	1	f6a622ad-52de-4d52-a103-0980708c32bb	admin-impersonate-store-1	2025-12-09 02:46:49.052386	2025-12-10 02:46:48.942
154	\N	83aa5739-0c3e-47fb-94fc-93ad490ebcc2	admin:5	2025-12-09 02:47:01.331851	2025-12-16 02:47:01.221
155	6	5f4b14c9-313f-4a09-b0ed-c168a0fa71c8	admin-impersonate-store-6	2025-12-09 02:47:03.431529	2025-12-10 02:47:03.321
156	\N	4ea96b45-9748-4e55-884f-7309e87e8aa7	admin:5	2025-12-09 02:50:06.657521	2025-12-16 02:50:06.545
157	1	8adf7783-590d-4fcd-bc5c-032467e32605	admin-impersonate-store-1	2025-12-09 02:50:11.772962	2025-12-10 02:50:11.661
158	\N	1113c69f-68c9-4365-b3c2-67943cc83d45	admin:5	2025-12-09 03:02:40.88427	2025-12-16 03:02:40.766
159	6	caff4809-b876-4283-bca4-8c4dc7996b84	admin-impersonate-store-6	2025-12-09 03:02:45.389556	2025-12-10 03:02:45.274
160	1	5230d33d-3142-48d4-b0f1-a9d41037e631	admin-impersonate-store-1	2025-12-09 03:02:49.383137	2025-12-10 03:02:49.266
161	2	99044243-1b67-4018-9101-54daaff72e18	admin-impersonate-store-2	2025-12-09 03:02:55.632758	2025-12-10 03:02:55.517
162	6	cc67ca2d-2c8c-43a8-8951-22b165a6ff76	admin-impersonate-store-6	2025-12-09 03:02:59.125439	2025-12-10 03:02:59.009
163	1	b15cfa70-3c96-4c78-9999-e8e8f649afbb	admin-impersonate-store-1	2025-12-09 03:03:02.041811	2025-12-10 03:03:01.926
164	1	4a4a969e-05d3-4e69-8edf-ab3e84200550	admin-impersonate-store-1	2025-12-09 03:03:24.512013	2025-12-10 03:03:24.389
165	1	0c06990c-6e60-4063-9791-08cab3774934	term-web-01	2025-12-09 03:04:05.200674	2026-12-09 03:04:05.072
166	\N	5a9589df-38b7-4677-a152-b7006fd2ed4e	admin:5	2025-12-09 03:04:16.346644	2025-12-16 03:04:16.213
167	6	3e0da816-8317-44ca-b93b-a393ea8adeca	admin-impersonate-store-6	2025-12-09 03:14:48.996959	2025-12-10 03:14:48.853
168	1	c91fad08-b135-4a41-ae21-c868639e354e	term-web-01	2025-12-09 03:14:56.712526	2026-12-09 03:14:56.568
169	\N	075c7248-7690-4475-87c3-ddc7172b1fa8	admin:5	2025-12-09 03:15:05.336949	2025-12-16 03:15:05.193
170	\N	08b21edc-f496-4bf0-8d16-d8867b787e07	admin:5	2025-12-09 03:15:55.597798	2025-12-16 03:15:55.453
171	\N	da8974f9-aaf8-4ca1-a6dd-452971f4d04d	admin:5	2025-12-09 03:16:15.59152	2025-12-16 03:16:15.445
172	1	45237d40-2f66-4c48-b70a-f358116edf76	admin-impersonate-store-1	2025-12-09 03:16:18.822413	2025-12-10 03:16:18.677
173	6	f383ae35-1e38-4d17-a943-e89fa98e53d0	admin-impersonate-store-6	2025-12-09 03:16:28.125532	2025-12-10 03:16:27.98
174	5	4fd34513-6199-4687-8101-7d6f06b018da	admin-impersonate-store-5	2025-12-09 03:16:32.76755	2025-12-10 03:16:32.622
175	2	1840229f-43f0-4d80-9b0d-26d1ff4834ba	admin-impersonate-store-2	2025-12-09 03:16:36.487846	2025-12-10 03:16:36.342
176	1	97726802-5ace-4ed8-b663-80f0ea9f3139	term-web-01	2025-12-09 07:40:03.427695	2026-12-09 07:40:03.377
177	\N	e44ef5de-8847-48b0-bc2a-eb9435e792b5	admin:5	2025-12-09 07:40:16.61579	2025-12-16 07:40:16.561
178	1	90e14798-c07d-4b61-9a07-9dd1f69712e5	admin-impersonate-store-1	2025-12-09 07:40:38.568054	2025-12-10 07:40:38.518
179	6	3ab44381-b8c1-46f6-a559-47fc1af75b20	admin-impersonate-store-6	2025-12-09 07:40:42.382255	2025-12-10 07:40:42.332
180	1	2c11f371-22b2-44ff-b87a-fc45a7f45184	admin-impersonate-store-1	2025-12-09 07:40:46.338585	2025-12-10 07:40:46.288
181	2	5b1396ac-ac04-4a95-ab7d-11c582c90b3f	admin-impersonate-store-2	2025-12-09 07:40:48.832164	2025-12-10 07:40:48.782
182	\N	1deb7905-634f-4e6b-92cc-96b77a0e405f	admin:5	2025-12-09 07:41:29.176873	2025-12-16 07:41:29.127
183	1	4dc3780d-8184-4ded-9890-d558d5d997df	admin-impersonate-store-1	2025-12-09 07:41:38.734847	2025-12-10 07:41:38.685
184	1	78fed302-5ca0-473d-afef-6485802d827a	admin-impersonate-store-1	2025-12-09 07:42:02.320257	2025-12-10 07:42:02.27
185	1	320994aa-0ece-4bd0-971d-48cf876e1c19	term-web-01	2025-12-09 08:42:45.407531	2026-12-09 08:42:45.315
186	1	421ed8b0-4369-494c-8080-8a73870d4de4	term-web-01	2025-12-09 14:36:44.009189	2026-12-09 09:06:43.936
187	1	0d9d7451-e904-4f16-8ec8-35dd52996090	term-web-01	2025-12-09 14:48:28.517469	2026-12-09 09:18:28.436
188	1	c4502fc3-96ca-4b97-906a-0ba77deffe72	term-web-01	2025-12-09 15:01:05.838643	2026-12-09 09:31:05.756
189	1	c5fb976a-7778-4c48-9243-7b84bf87a72d	term-web-01	2025-12-09 09:38:08.660678	2026-12-09 09:38:08.578
190	1	cb1b1cf1-942b-47e3-8581-d223c123706b	term-web-01	2025-12-09 10:22:12.112509	2026-12-09 10:22:12.007
191	1	0c55dd27-683b-4e44-b886-1e7e44bb8a6d	term-web-01	2025-12-09 15:56:19.185108	2026-12-09 10:26:19.095
192	1	ad2a3b16-d7d2-4bd9-89c1-5c258fedfa55	term-web-01	2025-12-09 16:21:58.248053	2026-12-09 10:51:58.172
193	\N	0a57f7d6-76b9-46f2-ba89-382a1b4e1b2c	admin:5	2025-12-09 16:27:33.189342	2025-12-16 10:57:33.113
194	\N	5568224b-f0da-4fe2-9ec1-df4fbb94e00a	admin:5	2025-12-09 16:27:53.51065	2025-12-16 10:57:53.434
195	\N	c3be30e6-cdcf-4b46-a3a8-8b04d74ef41b	admin:5	2025-12-09 10:58:06.827968	2025-12-16 10:58:06.753
196	1	7791ecb7-0b58-45fb-8665-30c15bc03594	admin-impersonate-store-1	2025-12-09 10:58:14.512268	2025-12-10 10:58:14.436
197	6	24b2913a-c95b-4d38-bf6d-cbd5a6482711	admin-impersonate-store-6	2025-12-09 10:58:17.488367	2025-12-10 10:58:17.413
198	1	3ab8c35c-efda-4f36-a6b9-15f6104b45f0	admin-impersonate-store-1	2025-12-09 10:58:20.956359	2025-12-10 10:58:20.881
199	6	3fb6830b-8532-43f5-8a5a-7e9207dd8d32	admin-impersonate-store-6	2025-12-09 10:58:23.517794	2025-12-10 10:58:23.442
200	1	75410b03-3d5d-4b5d-8ad9-82af13d4185e	term-web-01	2025-12-09 10:58:32.067062	2026-12-09 10:58:31.991
201	\N	3d3c63c3-c6bd-4118-87a5-0aa5f75f6989	admin:5	2025-12-09 10:58:45.273177	2025-12-16 10:58:45.189
202	\N	4afc2c38-4680-49bb-aa36-5cdd0f7268cc	admin:5	2025-12-09 17:14:59.295947	2025-12-16 11:44:59.183
203	\N	6cebe6da-df6f-4aa1-ac66-8bb27f5f7ebc	admin:5	2025-12-09 11:56:18.105297	2025-12-16 11:56:17.989
204	1	9df39176-4204-4c39-a525-d51411f7f0fa	admin-impersonate-store-1	2025-12-09 11:56:20.700135	2025-12-10 11:56:20.584
205	6	5a65b486-7acd-4ead-9390-109486950024	admin-impersonate-store-6	2025-12-09 11:56:24.083498	2025-12-10 11:56:23.967
206	1	f76f76c1-d344-48b4-87a8-72cd0eaed54e	term-web-01	2025-12-09 11:56:31.405525	2026-12-09 11:56:31.289
207	1	40560e1c-49a2-4ed7-a270-e1f39c722fee	term-web-01	2025-12-09 20:52:34.948522	2026-12-09 15:22:34.867
208	6	64bc4ffc-635f-4b9b-8da2-f8da0bc79485	term-web-01	2025-12-09 15:23:26.845848	2026-12-09 15:23:26.787
209	\N	6fe7eefd-8325-467d-83d0-6b83b985e5a9	admin:5	2025-12-09 15:23:39.928409	2025-12-16 15:23:39.851
210	1	f09de8b9-6c4e-4cdf-96ff-591e4e1e044d	admin-impersonate-store-1	2025-12-09 15:24:24.438351	2025-12-10 15:24:24.371
211	1	822c7da7-e7f2-4e9a-83c7-f09ecedd3424	admin-impersonate-store-1	2025-12-09 15:24:35.941652	2025-12-10 15:24:35.866
212	5	fa78904f-c056-47f2-8320-7ba6e71bfaa6	admin-impersonate-store-5	2025-12-09 15:24:39.196619	2025-12-10 15:24:39.132
213	6	e44e1fb0-561a-43b2-bbeb-dee0ac99e06d	admin-impersonate-store-6	2025-12-09 15:24:44.85513	2025-12-10 15:24:44.786
214	1	5f41c69d-b5a9-4b77-b44c-369001b194b3	term-web-01	2025-12-09 15:24:57.715724	2026-12-09 15:24:57.653
215	\N	2ea42172-fa1e-4b1a-8dda-bfc9bc13464f	admin:5	2025-12-09 15:25:09.895573	2025-12-16 15:25:09.829
\.


--
-- Data for Name: store_credentials; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.store_credentials (id, store_id, username, password_hash, created_at) FROM stdin;
1	1	store1	$2a$06$EhltD.QbtlheBrqqawR0k..nrSEbiJgmGrCEQ6oluYbpVSFPdpCa6	2025-12-04 02:44:45.8908
2	2	store2	$2a$06$tAnHY1/I.OJoMnCIHZKBaeNo0Lz8c4W2Xo6euL9rGHmdlzdO6GsHK	2025-12-04 02:44:45.8908
3	3	store3	$2a$06$cGxsDMoqi/0ltqPn7yVeD.YPeMM49eHQhHpJhG6Y3..mOycZPhD72	2025-12-04 02:44:45.8908
4	4	store4	$2a$06$UuOr4ia1G96hVhFqiuJ3ve7GD011Xbr0cdO3Jqy1rLIyjKsbxowwW	2025-12-08 13:01:06.619204
5	5	store5	$2a$06$C8/Wzgm5UpeICf47f0BxseKk.zE4TMlkUXFtjQBVaek4EC2l98CrG	2025-12-08 13:01:06.619204
6	6	store6	$2a$06$wKzX0PDTXy.UBG19vTawQ.nqYUcLt7ZJUkNjIGMmbU5/qXbPwVSkm	2025-12-08 13:01:06.619204
\.


--
-- Data for Name: stores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stores (id, name, created_at) FROM stdin;
2	Store B	2025-12-04 01:23:15.315275
3	Store C	2025-12-04 01:23:15.315275
1	Green House	2025-12-04 01:23:15.315275
4	Store D	2025-12-08 13:00:43.393725
5	Store E	2025-12-08 13:00:43.393725
6	Store F	2025-12-08 13:00:43.393725
\.


--
-- Data for Name: terminals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.terminals (id, store_id, terminal_uuid, label, created_at) FROM stdin;
1	1	term-1	Terminal-1	2025-12-04 01:23:15.315275
2	2	term-2	Terminal-2	2025-12-04 01:23:15.315275
3	3	term-3	Terminal-3	2025-12-04 01:23:15.315275
4	1	term-pc-01	Counter-1	2025-12-04 02:47:09.663263
50	2	admin-impersonate-store-2	Admin POS	2025-12-09 05:25:04.004515
55	3	admin-impersonate-store-3	Admin POS	2025-12-09 00:21:53.81931
59	4	admin-impersonate-store-4	Admin POS	2025-12-09 00:22:08.56808
46	1	admin-impersonate-store-1	Admin POS	2025-12-08 23:20:24.472981
107	5	admin-impersonate-store-5	Admin POS	2025-12-09 03:16:32.842769
85	6	admin-impersonate-store-6	Admin POS	2025-12-09 02:29:18.703179
7	1	term-web-01	Terminal	2025-12-04 09:08:07.216876
\.


--
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.admins_id_seq', 5, true);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 162, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_id_seq', 102, true);


--
-- Name: monthly_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.monthly_reports_id_seq', 32, true);


--
-- Name: product_price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_price_history_id_seq', 4, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 44, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sessions_id_seq', 215, true);


--
-- Name: store_credentials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.store_credentials_id_seq', 10, true);


--
-- Name: stores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stores_id_seq', 6, true);


--
-- Name: terminals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.terminals_id_seq', 138, true);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: admins admins_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_username_key UNIQUE (username);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: monthly_reports monthly_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_reports
    ADD CONSTRAINT monthly_reports_pkey PRIMARY KEY (id);


--
-- Name: monthly_reports monthly_reports_store_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_reports
    ADD CONSTRAINT monthly_reports_store_year_month_key UNIQUE (store_id, year, month);


--
-- Name: product_price_history product_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: store_credentials store_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_pkey PRIMARY KEY (id);


--
-- Name: store_credentials store_credentials_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_store_id_key UNIQUE (store_id);


--
-- Name: store_credentials store_credentials_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_username_key UNIQUE (username);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_terminal_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_terminal_uuid_key UNIQUE (terminal_uuid);


--
-- Name: idx_monthly_reports_store_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monthly_reports_store_month ON public.monthly_reports USING btree (store_id, year, month);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: invoices invoices_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: invoices invoices_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminals(id);


--
-- Name: product_price_history product_price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: sessions sessions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: store_credentials store_credentials_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: terminals terminals_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- PostgreSQL database dump complete
--

\unrestrict LHuai4E477TQjZf0zuB9qkOaqStPCDvKDAIT8qhL1gYNEjNnpxrIk5pcpPCxeTK

