--
-- PostgreSQL database dump
--

\restrict 54fw0uQparmqFQbUhmDIoIDq8ytgpZ8d4zwfvfEmxYazFHg98Jf6GnD7Sr2vY7a

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
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
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id integer NOT NULL,
    username character varying(120) NOT NULL,
    password_hash character varying(300) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: admins_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admins_id_seq OWNER TO postgres;

--
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer,
    product_id integer,
    qty numeric(12,3) NOT NULL,
    rate numeric(10,2) NOT NULL,
    amount numeric(12,2) NOT NULL
);


ALTER TABLE public.invoice_items OWNER TO postgres;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_items_id_seq OWNER TO postgres;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: product_price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_price_history (
    id integer NOT NULL,
    product_id integer,
    old_price numeric(10,2),
    new_price numeric(10,2),
    changed_by character varying(100),
    changed_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_price_history OWNER TO postgres;

--
-- Name: product_price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.product_price_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_price_history_id_seq OWNER TO postgres;

--
-- Name: product_price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.product_price_history_id_seq OWNED BY public.product_price_history.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    store_id integer,
    token character varying(200) NOT NULL,
    terminal_uuid character varying(200),
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO postgres;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: store_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.store_credentials (
    id integer NOT NULL,
    store_id integer,
    username character varying(120) NOT NULL,
    password_hash character varying(300) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.store_credentials OWNER TO postgres;

--
-- Name: store_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.store_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.store_credentials_id_seq OWNER TO postgres;

--
-- Name: store_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.store_credentials_id_seq OWNED BY public.store_credentials.id;


--
-- Name: stores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stores (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.stores OWNER TO postgres;

--
-- Name: stores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stores_id_seq OWNER TO postgres;

--
-- Name: stores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stores_id_seq OWNED BY public.stores.id;


--
-- Name: terminals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.terminals (
    id integer NOT NULL,
    store_id integer,
    terminal_uuid character varying(100) NOT NULL,
    label character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.terminals OWNER TO postgres;

--
-- Name: terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.terminals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.terminals_id_seq OWNER TO postgres;

--
-- Name: terminals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.terminals_id_seq OWNED BY public.terminals.id;


--
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: product_price_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history ALTER COLUMN id SET DEFAULT nextval('public.product_price_history_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: store_credentials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_credentials ALTER COLUMN id SET DEFAULT nextval('public.store_credentials_id_seq'::regclass);


--
-- Name: stores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores ALTER COLUMN id SET DEFAULT nextval('public.stores_id_seq'::regclass);


--
-- Name: terminals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals ALTER COLUMN id SET DEFAULT nextval('public.terminals_id_seq'::regclass);


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (id, username, password_hash, created_at) FROM stdin;
2	manager1	$2a$06$lucINvk54f/234PtFGDlKOsxODdWhMutyqzfdy8FeoJDcSmVGxqUC	2025-12-04 08:22:43.589885
1	admin	$2a$06$/7Sug6K3SciDR2kC2LetdezrDh7.csYNIjX2J3EoD9YFJpwjBbQWu	2025-12-04 08:05:23.819382
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoice_items (id, invoice_id, product_id, qty, rate, amount) FROM stdin;
96	62	30	1.000	40.00	40.00
97	62	31	1.055	10.00	10.55
98	63	30	2.000	40.00	80.00
99	63	33	1.251	200.00	250.20
100	63	31	0.291	10.00	2.91
101	64	33	2.516	200.00	503.20
102	64	32	1.000	10.00	10.00
103	64	31	2.850	10.00	28.50
104	64	30	1.000	40.00	40.00
105	65	30	1.000	40.00	40.00
106	66	31	0.718	10.00	7.18
107	66	32	4.000	10.00	40.00
108	66	30	2.000	40.00	80.00
109	67	30	1.000	40.00	40.00
110	67	31	2.081	10.00	20.81
111	68	34	1.000	20.00	20.00
112	68	31	2.134	10.00	21.34
113	69	31	0.682	10.00	6.82
114	69	32	1.000	10.00	10.00
115	69	33	0.834	200.00	166.80
116	70	32	10.000	10.00	100.00
117	70	37	0.888	10.00	8.88
118	70	33	1.170	200.00	234.00
119	70	30	1.000	50.00	50.00
120	71	31	0.834	10.00	8.34
121	71	32	1.000	10.00	10.00
122	72	30	2.000	50.00	100.00
123	73	30	1.000	50.00	50.00
124	74	32	2.000	10.00	20.00
125	74	33	0.783	200.00	156.60
126	75	30	1.000	50.00	50.00
127	76	32	1.000	10.00	10.00
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, invoice_no, store_id, terminal_id, total, tax, status, idempotency_key, created_at) FROM stdin;
75	INV-1765113402470	1	7	50.00	0.00	voided	web-1765113401468	2025-12-07 13:16:42.135007
62	INV-1765072700774	1	7	50.55	0.00	voided	web-1765072699782	2025-12-07 01:58:20.47401
63	INV-1765072810299	1	7	333.11	0.00	voided	web-1765072809300	2025-12-07 02:00:09.998274
64	INV-1765075329995	1	7	581.70	0.00	voided	web-1765075329001	2025-12-07 02:42:09.679482
65	INV-1765075430027	1	7	40.00	0.00	synced	web-1765075429033	2025-12-07 02:43:49.709973
67	INV-1765076299334	1	7	60.81	0.00	voided	web-1765076298341	2025-12-07 02:58:19.014721
66	INV-1765076231470	1	7	127.18	0.00	voided	web-1765076230481	2025-12-07 02:57:11.15039
68	INV-1765087198454	1	7	41.34	0.00	voided	web-1765087197535	2025-12-07 05:59:58.153653
69	INV-1765097495621	1	7	183.62	0.00	voided	web-1765097494092	2025-12-07 08:51:35.071766
70	INV-1765111787950	1	7	392.88	0.00	synced	web-1765111786954	2025-12-07 12:49:47.630246
71	INV-1765112038790	1	7	18.34	0.00	synced	web-1765112037798	2025-12-07 12:53:58.472551
72	INV-1765112081302	1	7	100.00	0.00	synced	web-1765112080025	2025-12-07 12:54:40.954083
73	INV-1765112339188	1	7	50.00	0.00	synced	web-1765112338201	2025-12-07 12:58:58.873314
74	INV-1765112357586	1	7	176.60	0.00	synced	web-1765112356345	2025-12-07 12:59:17.055825
76	INV-1765113409807	1	7	10.00	0.00	voided	web-1765113408796	2025-12-07 13:16:49.471862
\.


--
-- Data for Name: product_price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_price_history (id, product_id, old_price, new_price, changed_by, changed_at) FROM stdin;
1	1	30.00	35.50	admin_raksh	2025-12-04 02:58:38.064984
2	1	35.50	36.00	admin	2025-12-04 03:00:53.560022
3	2	25.00	29.00	admin	2025-12-04 03:00:53.560022
4	1	33.50	99.99	admin	2025-12-04 08:37:27.138462
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, sku, name, unit, price, stock, store_id, updated_at, deleted_at, allow_decimal_qty) FROM stdin;
38	QK-1765097782666	Tomoto (nati)	kg	40.00	100.000	1	2025-12-07 08:56:23.626544	\N	t
23	QK-1765022825835	packet	kg	10.00	0.000	1	2025-12-06 12:27:26.380169	2025-12-06 12:27:26.380169	t
12	QK-1765019269892	Carrot	kg	20.00	20.000	1	2025-12-06 12:27:11.958203	2025-12-06 12:27:11.958203	t
18	manual-1765020878335	Cabbage	kg	10.00	10.000	1	2025-12-06 12:27:13.31437	2025-12-06 12:27:13.31437	t
9	QK-1765018796293	Apple	kg	120.00	0.000	1	2025-12-06 12:27:07.506249	2025-12-06 12:27:07.506249	t
22	manual-1765021440026	corn	kg	10.00	0.000	1	2025-12-06 12:27:22.226331	2025-12-06 12:27:22.226331	t
37	QK-1765097670161	onion	kg	10.00	-0.888	1	2025-12-07 12:49:47.630246	\N	t
19	QK-1765020909382	water bottle	kg	10.00	100.000	1	2025-12-06 12:27:23.594824	2025-12-06 12:27:23.594824	t
31	QK-1765024684194	Tomato	kg	10.00	-0.834	1	2025-12-07 12:53:58.472551	\N	t
26	QK-1765023064818	error	kg	10.00	0.000	1	2025-12-06 12:27:28.241807	2025-12-06 12:27:28.241807	t
28	manual-1765024056274	Pen	kg	10.00	0.000	1	2025-12-06 12:28:07.902828	2025-12-06 12:28:07.902828	t
29	QK-1765024072209	pencil	qty	10.00	0.000	1	2025-12-06 12:28:29.507168	2025-12-06 12:28:29.507168	f
33	QK-1765024852342	Carrot	kg	200.00	-1.953	1	2025-12-07 12:59:17.055825	\N	t
27	QK-1765023971038	pencil	qty	10.00	0.000	1	2025-12-06 12:27:31.450617	2025-12-06 12:27:31.450617	f
11	QK-1765019195456	Tomato	kg	100.00	10.000	1	2025-12-06 12:27:17.507481	2025-12-06 12:27:17.507481	t
20	QK-1765020960863	beans	kg	50.00	100.000	1	2025-12-06 12:27:15.625238	2025-12-06 12:27:15.625238	t
13	QK-1765019763158	Banana	kg	5.00	100.000	1	2025-12-06 12:27:19.172364	2025-12-06 12:27:19.172364	t
10	manual-1765019165433	Coriander	kg	10.00	10.000	1	2025-12-06 12:27:10.709451	2025-12-06 12:27:10.709451	t
32	manual-1765024715561	Pen	qty	10.00	-13.000	1	2025-12-07 13:16:49.471862	\N	f
30	QK-1765024118874	Bread	qty	50.00	96.000	1	2025-12-07 13:16:42.135007	\N	f
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
35	manual-1765087323207	Onion	kg	20.00	100.000	1	2025-12-07 06:02:06.239828	\N	t
34	QK-1765087157311	Pudina	qty	20.00	100.000	1	2025-12-07 05:59:58.153653	\N	f
36	QK-1765097399243	Coriander	qty	20.00	200.000	1	2025-12-07 08:50:00.151753	\N	f
25	QK-1765022987536	tgtrghyjffed rfrfgyhb gtrftrgbhun rtf6thy7j t6g7y	kg	90.00	0.000	1	2025-12-06 12:27:29.663768	2025-12-06 12:27:29.663768	t
24	QK-1765022884088	Pen	kg	10.00	0.000	1	2025-12-06 12:27:24.901013	2025-12-06 12:27:24.901013	t
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
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
\.


--
-- Data for Name: store_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.store_credentials (id, store_id, username, password_hash, created_at) FROM stdin;
1	1	store1	$2a$06$EhltD.QbtlheBrqqawR0k..nrSEbiJgmGrCEQ6oluYbpVSFPdpCa6	2025-12-04 02:44:45.8908
2	2	store2	$2a$06$tAnHY1/I.OJoMnCIHZKBaeNo0Lz8c4W2Xo6euL9rGHmdlzdO6GsHK	2025-12-04 02:44:45.8908
3	3	store3	$2a$06$cGxsDMoqi/0ltqPn7yVeD.YPeMM49eHQhHpJhG6Y3..mOycZPhD72	2025-12-04 02:44:45.8908
\.


--
-- Data for Name: stores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stores (id, name, created_at) FROM stdin;
2	Store B	2025-12-04 01:23:15.315275
3	Store C	2025-12-04 01:23:15.315275
1	Green House	2025-12-04 01:23:15.315275
\.


--
-- Data for Name: terminals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.terminals (id, store_id, terminal_uuid, label, created_at) FROM stdin;
1	1	term-1	Terminal-1	2025-12-04 01:23:15.315275
2	2	term-2	Terminal-2	2025-12-04 01:23:15.315275
3	3	term-3	Terminal-3	2025-12-04 01:23:15.315275
4	1	term-pc-01	Counter-1	2025-12-04 02:47:09.663263
7	1	term-web-01	Terminal	2025-12-04 09:08:07.216876
\.


--
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admins_id_seq', 2, true);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 127, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoices_id_seq', 76, true);


--
-- Name: product_price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_price_history_id_seq', 4, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 38, true);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sessions_id_seq', 35, true);


--
-- Name: store_credentials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.store_credentials_id_seq', 3, true);


--
-- Name: stores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stores_id_seq', 3, true);


--
-- Name: terminals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.terminals_id_seq', 26, true);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: admins admins_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_username_key UNIQUE (username);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: product_price_history product_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: store_credentials store_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_pkey PRIMARY KEY (id);


--
-- Name: store_credentials store_credentials_store_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_store_id_key UNIQUE (store_id);


--
-- Name: store_credentials store_credentials_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_username_key UNIQUE (username);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_terminal_uuid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_terminal_uuid_key UNIQUE (terminal_uuid);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: invoices invoices_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: invoices invoices_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.terminals(id);


--
-- Name: product_price_history product_price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_price_history
    ADD CONSTRAINT product_price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: sessions sessions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: store_credentials store_credentials_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_credentials
    ADD CONSTRAINT store_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- Name: terminals terminals_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 54fw0uQparmqFQbUhmDIoIDq8ytgpZ8d4zwfvfEmxYazFHg98Jf6GnD7Sr2vY7a

