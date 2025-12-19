# 🚀 Tourwise: Technology Stack

## Core Specialized Features
Overview of the specialized technologies selected to handle complex travel data, geolocation, and media.

| Feature Scope | **Technology Selected** | **Strategic Rationale** |
| :--- | :--- | :--- |
| **🗺️ Geolocation** | `Mapbox GL JS` | **Cost & Style.** Unlike Google Maps, Mapbox allows custom "Travel" map skins and is significantly cheaper for startups with high-volume views. |
| **📅 Scheduling** | `Day.js` | **Timezone Safety.** Handling bookings across timezones (User vs. Destination) requires immutable, lightweight date parsing that standard JS cannot provide. |
| **⚡ Search** | `Meilisearch` | **Performance.** Provides "Instant-Search" (typo-tolerance, filters) for queries like *"Cheap beach tour"* without the latency of SQL `LIKE` queries. |
| **☁️ Media** | `Cloudinary` | **Optimization.** Auto-compresses and resizes high-res tour photos on the fly, ensuring the app loads fast on mobile networks. |

---
# 🏗️ Tourwise Architecture Decision Record

### 1. 🗺️ Interactive Mapping
**Selected Tech:** [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/api/)

> **Why not Google Maps?**
> Google Maps pricing scales poorly for public-facing apps. Mapbox offers a generous free tier and superior customization capabilities, allowing us to highlight tour routes visually without clutter.

* **Key Feature:** Custom markers for "Meeting Points".
* **Integration:** React Wrapper (`react-map-gl`).

---

### 2. 📅 Date & Booking Management
**Selected Tech:** [Day.js](https://day.js.org/)

> **The Challenge:**
> A user in New York (EST) booking a tour in Palawan (PHT) creates a timezone conflict. Standard JavaScript `Date` objects default to the browser's local time, which causes booking errors.

* **Solution:** `Day.js` is 2kB (tiny) and handles UTC conversions seamlessly.
* **Replacement For:** Moment.js (Legacy/Too heavy).

---

### 3. 🔍 Discovery Engine
**Selected Tech:** [Meilisearch](https://www.meilisearch.com/)

> **The Experience:**
> Users expect "Google-like" search. If they type "Beach", they want results instantly.

* **Mechanism:** Indexes tour titles, descriptions, and tags into a searchable document store.
* **Architecture:** Syncs with PostgreSQL. When a tour is created in Flask, a copy is sent to Meilisearch.

---

### 4. ☁️ Asset Delivery Network
**Selected Tech:** [Cloudinary](https://cloudinary.com/)

> **Performance Critical:**
> Travel apps are 90% visual. Hosting images on the Flask server consumes bandwidth and RAM. Cloudinary offloads this entirely.

* **Automatic Feature:** `f_auto,q_auto` (Delivers WebP format automatically).
* **Frontend Hook:** Returns a URL string directly to the `<img />` tag.
