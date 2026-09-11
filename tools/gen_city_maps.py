"""One-off generator: builds the ten city maps and inserts them into
gamehub_server.py's TRAINING_MAPS registry before TRAINING_DEFAULT_MAP.

Layout model per map: real neighborhood stops arranged in a ring around one
or two downtown hubs. Routes = the ring cycle + a spoke from each ring stop
to its assigned hub (+ the hub-to-hub link when a map has two hubs). A wheel
is planar by construction, so route lines can never cross.
"""
from collections import deque

PALETTE = ["red", "orange", "yellow", "green", "blue", "pink", "black", "white"]

# stops: (id, name, x, y, label, hub)  — hub = which hub this stop's spoke links to.
# ring lists stops in clockwise order; hubs are separate.
CITY_SPECS = {
    "cleveland": {
        "name": "Cleveland",
        "blurb": "Neighborhoods along the Cuyahoga and the lakefront.",
        "trains": 14,
        "hub": [("public_square", "Public Square", 500, 330, "e")],
        "ring": [
            ("west_park", "West Park", 140, 150, "n", "public_square"),
            ("lakewood", "Lakewood", 75, 300, "w", "public_square"),
            ("shoreway", "Detroit-Shoreway", 150, 420, "s", "public_square"),
            ("tremont", "Tremont", 290, 490, "s", "public_square"),
            ("flats", "The Flats", 360, 400, "s", "public_square"),
            ("shaker", "Shaker Square", 620, 480, "s", "public_square"),
            ("university", "University Circle", 740, 400, "e", "public_square"),
            ("heights", "Cleveland Heights", 850, 330, "e", "public_square"),
            ("collinwood", "Collinwood", 870, 140, "n", "public_square"),
            ("little_italy", "Little Italy", 720, 200, "n", "public_square"),
            ("playhouse", "Playhouse Square", 620, 280, "e", "public_square"),
            ("warehouse", "Warehouse District", 330, 290, "w", "public_square"),
        ],
    },
    "sanfrancisco": {
        "name": "San Francisco",
        "blurb": "Fog, hills, and forty-nine square miles of neighborhoods.",
        "trains": 14,
        "hub": [("union_square", "Union Square", 470, 320, "e")],
        "ring": [
            ("pacific_heights", "Pacific Heights", 300, 180, "n", "union_square"),
            ("marina", "Marina", 430, 110, "n", "union_square"),
            ("fish_wharf", "Fisherman's Wharf", 600, 150, "e", "union_square"),
            ("embarcadero", "Embarcadero", 660, 270, "e", "union_square"),
            ("dogpatch", "Dogpatch", 640, 410, "e", "union_square"),
            ("mission", "Mission", 450, 440, "s", "union_square"),
            ("castro", "Castro", 330, 400, "w", "union_square"),
            ("haight", "Haight-Ashbury", 250, 360, "w", "union_square"),
            ("sunset", "Sunset", 120, 420, "s", "union_square"),
            ("richmond", "Richmond", 100, 270, "w", "union_square"),
            ("presidio", "Presidio", 170, 150, "n", "union_square"),
        ],
    },
    "seattle": {
        "name": "Seattle",
        "blurb": "Ferries, hills, and coffee between two saltwater hubs.",
        "trains": 16,
        "hub": [
            ("westlake", "Westlake", 470, 330, "e"),
            ("pike_place", "Pike Place Market", 390, 340, "s"),
        ],
        "ring": [
            ("greenlake", "Green Lake", 250, 115, "n", "pike_place"),
            ("udistrict", "U District", 500, 110, "n", "pike_place"),
            ("capitol", "Capitol Hill", 640, 290, "e", "pike_place"),
            ("beacon", "Beacon Hill", 620, 420, "s", "westlake"),
            ("columbia", "Columbia City", 700, 500, "s", "westlake"),
            ("sodo", "SoDo", 450, 480, "s", "westlake"),
            ("westseattle", "West Seattle", 270, 510, "s", "pike_place"),
            ("magnolia", "Magnolia", 160, 230, "w", "pike_place"),
            ("ballard", "Ballard", 140, 110, "n", "pike_place"),
        ],
    },
    "losangeles": {
        "name": "Los Angeles",
        "blurb": "From the ocean to the mountains, stuck on the 110.",
        "trains": 13,
        "hub": [
            ("downtown", "Downtown", 470, 330, "e"),
            ("hollywood", "Hollywood", 400, 170, "n"),
        ],
        "ring": [
            ("santamonica", "Santa Monica", 100, 310, "w", "hollywood"),
            ("venice", "Venice", 140, 440, "s", "downtown"),
            ("inglewood", "Inglewood", 330, 550, "s", "downtown"),
            ("southla", "South LA", 540, 520, "s", "downtown"),
            ("boyle", "Boyle Heights", 660, 390, "e", "downtown"),
            ("pasadena", "Pasadena", 730, 190, "e", "hollywood"),
            ("burbank", "Burbank", 560, 80, "n", "hollywood"),
            ("northridge", "Northridge", 230, 80, "n", "hollywood"),
        ],
    },
    "atlanta": {
        "name": "Atlanta",
        "blurb": "Peachtree lines radiating from Five Points.",
        "trains": 14,
        "hub": [
            ("fivepoints", "Five Points", 460, 340, "s"),
            ("lenox", "Lenox", 620, 150, "n"),
        ],
        "ring": [
            ("vinings", "Vinings", 250, 230, "w", "fivepoints"),
            ("west_midtown", "West Midtown", 340, 150, "n", "fivepoints"),
            ("midtown", "Midtown", 540, 200, "n", "lenox"),
            ("druid", "Druid Hills", 700, 300, "e", "lenox"),
            ("decatur", "Decatur", 700, 420, "e", "fivepoints"),
            ("cabbagetown", "Cabbagetown", 580, 460, "e", "fivepoints"),
            ("inman", "Inman Park", 540, 390, "w", "fivepoints"),
            ("west_end", "West End", 320, 470, "s", "fivepoints"),
            ("bankhead", "Bankhead", 170, 350, "w", "fivepoints"),
        ],
    },
    "newyork": {
        "name": "New York",
        "blurb": "The island, the bridge, and the BMT, bound together.",
        "trains": 16,
        "hub": [
            ("times_square", "Times Square", 450, 220, "w"),
            ("wallst", "Wall Street", 520, 420, "s"),
        ],
        "ring": [
            ("harlem", "Harlem", 540, 100, "n", "times_square"),
            ("astoria", "Astoria", 660, 170, "e", "times_square"),
            ("williamsburg", "Williamsburg", 700, 320, "e", "wallst"),
            ("park_slope", "Park Slope", 590, 460, "s", "wallst"),
            ("brooklynhts", "Brooklyn Heights", 555, 395, "s", "wallst"),
            ("tribeca", "Tribeca", 430, 415, "s", "wallst"),
            ("greenwich", "Greenwich Village", 455, 345, "e", "times_square"),
            ("chelsea", "Chelsea", 380, 270, "w", "times_square"),
            ("upper_west", "Upper West Side", 310, 150, "w", "times_square"),
            ("upper_east", "Upper East Side", 420, 120, "n", "times_square"),
        ],
    },
    "melbourne": {
        "name": "Melbourne",
        "blurb": "Trams out of Flinders Street, up Swanston and beyond.",
        "trains": 14,
        "hub": [
            ("flinders", "Flinders Street", 470, 330, "e"),
            ("southern_cross", "Southern Cross", 360, 270, "w"),
        ],
        "ring": [
            ("north_melbourne", "North Melbourne", 270, 240, "w", "southern_cross"),
            ("brunswick", "Brunswick", 430, 100, "n", "flinders"),
            ("carlton", "Carlton", 540, 120, "n", "flinders"),
            ("fitzroy", "Fitzroy", 580, 160, "n", "flinders"),
            ("collingwood", "Collingwood", 650, 230, "e", "flinders"),
            ("richmond", "Richmond", 620, 390, "e", "flinders"),
            ("st_kilda", "St Kilda", 490, 510, "s", "flinders"),
            ("port_melbourne", "Port Melbourne", 300, 490, "s", "southern_cross"),
            ("footscray", "Footscray", 160, 360, "w", "southern_cross"),
        ],
    },
    "sydney": {
        "name": "Sydney",
        "blurb": "Harbour ferries and the T-lines out of Central.",
        "trains": 13,
        "hub": [
            ("circularquay", "Circular Quay", 500, 290, "e"),
            ("central", "Central", 460, 400, "s"),
        ],
        "ring": [
            ("blacktown", "Blacktown", 80, 130, "w", "circularquay"),
            ("ryde", "West Ryde", 330, 110, "n", "central"),
            ("chatswood", "Chatswood", 520, 85, "n", "circularquay"),
            ("manly", "Manly", 690, 110, "e", "circularquay"),
            ("bondi", "Bondi Beach", 730, 420, "e", "central"),
            ("coogee", "Coogee", 610, 490, "s", "central"),
            ("bankstown", "Bankstown", 350, 545, "s", "central"),
            ("newtown", "Newtown", 330, 450, "w", "central"),
            ("parramatta", "Parramatta", 170, 180, "w", "central"),
        ],
    },
    "detroit": {
        "name": "Detroit",
        "blurb": "Motown blocks between the river and New Center.",
        "trains": 13,
        "hub": [
            ("campus", "Campus Martius", 450, 300, "e"),
            ("newcenter", "New Center", 530, 140, "n"),
        ],
        "ring": [
            ("warrendale", "Warrendale", 110, 370, "w", "campus"),
            ("corktown", "Corktown", 240, 410, "s", "campus"),
            ("mexicantown", "Mexicantown", 370, 430, "s", "campus"),
            ("riverfront", "Riverfront", 490, 430, "s", "campus"),
            ("eastern", "Eastern Market", 640, 390, "e", "campus"),
            ("hamtramck", "Hamtramck", 650, 230, "e", "newcenter"),
            ("midtown", "Midtown", 460, 220, "n", "newcenter"),
            ("woodbridge", "Woodbridge", 310, 280, "w", "campus"),
        ],
    },
    "minneapolis": {
        "name": "Minneapolis",
        "blurb": "Lakes, loons, and the Blue and Green lines.",
        "trains": 13,
        "hub": [
            ("downtown", "Downtown", 460, 280, "e"),
            ("uptown", "Uptown", 320, 430, "s"),
        ],
        "ring": [
            ("north_mpls", "North Minneapolis", 160, 220, "w", "downtown"),
            ("dinkytown", "Dinkytown", 500, 200, "n", "downtown"),
            ("northeast", "Northeast", 580, 140, "n", "downtown"),
            ("st_anthony", "St. Anthony Main", 630, 270, "e", "downtown"),
            ("seward", "Seward", 570, 390, "e", "downtown"),
            ("longfellow", "Longfellow", 650, 470, "e", "downtown"),
            ("nokomis", "Nokomis", 500, 530, "s", "uptown"),
            ("calhoun", "Bde Maka Ska", 240, 410, "w", "uptown"),
            ("lynlake", "Lyn-Lake", 330, 360, "w", "uptown"),
        ],
    },
}


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def route_length(px):
    if px <= 140:
        return 1
    if px <= 280:
        return 2
    return 3


def build_map(spec):
    stops = {sid: (sid, name, x, y, label, hub) for sid, name, x, y, label, hub in spec["ring"]}
    for hid, hname, hx, hy, hlabel in spec["hub"]:
        stops[hid] = (hid, hname, hx, hy, hlabel, None)

    ring_ids = [s[0] for s in spec["ring"]]
    coords = {sid: (stops[sid][2], stops[sid][3]) for sid in stops}

    routes = []
    # Ring cycle.
    ring_pair = list(zip(ring_ids, ring_ids[1:] + ring_ids[:1]))
    for i, (a, b) in enumerate(ring_pair):
        color = PALETTE[i % len(PALETTE)]
        if i % 5 == 4:
            color = "gray"
        routes.append((a, b, color, route_length(dist(coords[a], coords[b]))))
    # Spokes.
    spoke_offset = 3
    for i, s in enumerate(spec["ring"]):
        a, hub = s[0], s[5]
        color = PALETTE[(spoke_offset + i) % len(PALETTE)]
        routes.append((a, hub, color, route_length(dist(coords[a], coords[hub]))))
    # Hub-to-hub link when two hubs exist.
    if len(spec["hub"]) == 2:
        h1, h2 = spec["hub"]
        color = PALETTE[(spoke_offset + len(spec["ring"])) % len(PALETTE)]
        routes.append((h1[0], h2[0], color, route_length(dist((h1[2], h1[3]), (h2[2], h2[3])))))

    # Graph for BFS ticket distances.
    adj = {sid: set() for sid in stops}
    for a, b, _c, _l in routes:
        adj[a].add(b)
        adj[b].add(a)

    def bfs_dist(src):
        seen = {src: 0}
        q = deque([src])
        while q:
            cur = q.popleft()
            for nb in adj[cur]:
                if nb not in seen:
                    seen[nb] = seen[cur] + 1
                    q.append(nb)
        return seen

    all_ids = sorted(stops)
    pairs = []
    for i, src in enumerate(all_ids):
        dists = bfs_dist(src)
        for dst in all_ids[i + 1:]:
            d = dists.get(dst, 0)
            if 2 <= d <= 4:
                pairs.append((d, src, dst))
    pairs.sort()
    tickets = []
    seen_pair = set()
    for d, a, b in pairs:
        key = tuple(sorted([a, b]))
        if key in seen_pair:
            continue
        seen_pair.add(key)
        tickets.append((a, b, max(4, 2 * d)))
        if len(tickets) >= 20:
            break

    segments = sum(r[3] for r in routes)
    trains = max(10, round(0.38 * segments))
    return routes, tickets, trains


def render_entry(map_id, spec):
    routes, tickets, trains = build_map(spec)
    lines = []
    lines.append(f'    "{map_id}": {{')
    lines.append(f'        "name": "{spec["name"]}",')
    lines.append(f'        "blurb": "{spec["blurb"]}",')
    lines.append(f'        "trains": {trains},')
    lines.append('        "cities": (')
    for sid, name, x, y, label, _hub in spec["ring"]:
        lines.append(f'            {{"id": "{sid}", "name": "{name}", "x": {x}, "y": {y}, "label": "{label}"}},')
    for hid, hname, hx, hy, hlabel in spec["hub"]:
        lines.append(f'            {{"id": "{hid}", "name": "{hname}", "x": {hx}, "y": {hy}, "label": "{hlabel}"}},')
    lines.append("        ),")
    lines.append('        "routes": (')
    for a, b, color, length in routes:
        lines.append(f'            ("{a}", "{b}", "{color}", {length}),')
    lines.append("        ),")
    lines.append('        "tickets": (')
    for a, b, points in tickets:
        lines.append(f'            ("{a}", "{b}", {points}),')
    lines.append("        ),")
    lines.append("    },")
    return "\n".join(lines), len(routes), sum(r[3] for r in routes), len(tickets), trains


path = "gamehub_server.py"
src = open(path).read()
anchor = 'TRAINING_DEFAULT_MAP = "coastline"'
assert anchor in src

entries = []
for map_id, spec in CITY_SPECS.items():
    text, nr, segs, nt, trains = render_entry(map_id, spec)
    entries.append(text)
    print(f"{map_id}: {nr} routes, {segs} segments, {nt} tickets, {trains} trains/player")

block = "\n".join(entries) + "\n\n"
src = src.replace(anchor, block + anchor)
open(path, "w").write(src)
print("inserted into", path)
