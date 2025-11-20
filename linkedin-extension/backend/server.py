"""
LinkedIn Scraper Backend Server
Uses linkedin-api library to login and scrape posts
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta

try:
    from linkedin_api import Linkedin

    LINKEDIN_API_AVAILABLE = True
except ImportError as e:
    print(f"Warning: linkedin-api import failed: {e}")
    LINKEDIN_API_AVAILABLE = False
    Linkedin = None

app = Flask(__name__)
CORS(app)

scraped_posts = []

linkedin_api = None

last_poll_timestamp = None
checked_post_ids = set()


def parse_relative_time(time_str):
    """Parse relative time strings like '1w', '20h', '1d', '1y' into datetime"""
    if not time_str or not isinstance(time_str, str):
        return None

    time_str = time_str.strip().lower()

    time_str = (
        time_str.replace("•", "")
        .replace(" ", "")
        .replace("visibletoeveryone", "")
        .strip()
    )

    try:
        import re

        match = re.match(r"(\d+)([a-z]+)", time_str)
        if not match:
            return None

        number = int(match.group(1))
        unit = match.group(2)

        now = datetime.now()

        if unit in ["h", "hr", "hrs", "hour", "hours"]:
            return now - timedelta(hours=number)
        elif unit in ["d", "day", "days"]:
            return now - timedelta(days=number)
        elif unit in ["w", "wk", "week", "weeks"]:
            return now - timedelta(weeks=number)
        elif unit in ["m", "mo", "month", "months"]:
            return now - timedelta(days=number * 30)
        elif unit in ["y", "yr", "year", "years"]:
            return now - timedelta(days=number * 365)
        else:
            return None
    except Exception as e:
        print(f"   ⚠️ Could not parse relative time '{time_str}': {e}")
        return None


def get_post_date(post):
    """Helper function to extract date from post for sorting"""
    date_str = (
        post.get("createdAt")
        or post.get("created")
        or post.get("time")
        or post.get("scrapedAt", "")
    )
    if not date_str:
        return datetime.min
    try:
        if isinstance(date_str, str):
            date_str = date_str.split("+")[0].split("Z")[0]
            return datetime.fromisoformat(date_str.replace("T", " "))
    except:
        pass
    return datetime.min


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "LinkedIn Scraper Backend is running"})


@app.route("/login", methods=["POST"])
def login():
    """Login to LinkedIn using credentials"""
    global linkedin_api

    if not LINKEDIN_API_AVAILABLE:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "linkedin-api library is not available. Please install it: pip install linkedin-api",
                }
            ),
            500,
        )

    try:
        data = request.json
        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return (
                jsonify({"success": False, "error": "Email and password are required"}),
                400,
            )

        linkedin_api = Linkedin(email, password)

        try:
            profile = {
                "firstName": "User",
                "lastName": "",
                "username": email.split("@")[0],
            }

        except Exception as profile_error:
            profile = {
                "firstName": "User",
                "lastName": "",
                "username": email.split("@")[0],
            }

        return jsonify(
            {
                "success": True,
                "message": "Successfully logged in to LinkedIn",
                "profile": {
                    "name": profile.get("firstName", "")
                    + " "
                    + profile.get("lastName", ""),
                    "username": profile.get(
                        "username", email.split("@")[0] if "@" in email else "user"
                    ),
                },
            }
        )

    except Exception as e:
        error_msg = str(e)
        if "_AUTH_BASE_URL" in error_msg:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "LinkedIn API version incompatibility. Please upgrade: pip install --upgrade linkedin-api",
                    }
                ),
                500,
            )
        return jsonify({"success": False, "error": str(e)}), 500


def search_posts_by_keywords(
    keywords, limit=50, offset=0, days_back=30, exclude_ids=None
):
    """
    Internal function to search for posts by keywords
    Returns tuple: (processed_posts, raw_search_results)
    - processed_posts: List of posts sorted by date (newest first) with extracted data
    - raw_search_results: List of raw search results from API

    Args:
        keywords: List of keywords to search for
        limit: Number of posts to fetch per keyword (default: 50)
        offset: Pagination offset for different batches (default: 0)
        days_back: Only fetch posts from the last N days (default: 30) - used for API-level filtering
        exclude_ids: Set of post IDs to exclude (already checked)
    """
    global linkedin_api

    if exclude_ids is None:
        exclude_ids = set()

    if not linkedin_api:
        raise Exception("Not logged in. Please login first.")

    if not keywords:
        raise Exception("Keywords are required")

    all_posts = []
    all_raw_results = []

    print(f"📊 Search params: limit={limit}, offset={offset}, days_back={days_back}")
    print(f"📅 API-level date filtering: last {days_back} days")

    try:
        for keyword in keywords:
            print(f"🔍 Searching for keyword: {keyword}")
            try:
                if hasattr(linkedin_api, "search"):
                    filters = ["(key:resultType,value:List(CONTENT))"]

                    if days_back and days_back > 0:
                        seconds_back = days_back * 24 * 60 * 60
                        filters.append(
                            f"(key:timePostedRange,value:List(r{seconds_back}))"
                        )
                        print(
                            f"   📅 Adding time filter: last {days_back} days ({seconds_back} seconds)"
                        )

                    filters_str = f"List({','.join(filters)})"

                    try:
                        search_params = {"keywords": keyword, "filters": filters_str}
                        print(f"   🔍 Using filters: {filters_str}")
                        search_results = linkedin_api.search(
                            search_params, limit=limit, offset=offset
                        )

                        if search_results:
                            all_raw_results.extend(search_results)
                    except Exception as search_error:
                        print(
                            f"   ⚠️ search() with time filter failed: {str(search_error)}"
                        )
                        try:
                            search_params = {
                                "keywords": keyword,
                                "filters": "List((key:resultType,value:List(CONTENT)))",
                            }
                            print(f"   🔍 Retrying without time filter...")
                            search_results = linkedin_api.search(
                                search_params, limit=limit, offset=offset
                            )
                            if search_results:
                                all_raw_results.extend(search_results)
                        except Exception as search_error2:
                            print(
                                f"   ⚠️ search() with content filter also failed: {str(search_error2)}, trying without filter..."
                            )
                            try:
                                search_params = {"keywords": keyword}
                                search_results = linkedin_api.search(
                                    search_params, limit=limit, offset=offset
                                )
                                if search_results:
                                    all_raw_results.extend(search_results)
                            except Exception as search_error3:
                                print(
                                    f"   ⚠️ search() without filter failed: {str(search_error3)}"
                                )
                                search_results = None

                if search_results:
                    for result in search_results:
                        if not result:
                            continue

                        tracking_urn = (
                            result.get("trackingUrn")
                            or result.get("dashEntityUrn")
                            or result.get("entityUrn")
                            or result.get("urn")
                            or result.get("actorNavigationContext", {}).get(
                                "trackingUrn", ""
                            )
                            or result.get("actorNavigationContext", {}).get(
                                "entityUrn", ""
                            )
                        )

                        post_id = None
                        if tracking_urn:
                            if isinstance(tracking_urn, str) and ":" in tracking_urn:
                                parts = tracking_urn.split(":")
                                if len(parts) > 0:
                                    post_id = parts[-1]

                        if not post_id:
                            post_id = result.get("id") or str(result)

                        post_id_str = str(post_id)
                        if post_id_str in exclude_ids:
                            continue

                        post_text = ""

                        commentary = result.get("commentary", {})
                        if isinstance(commentary, dict):
                            if "text" in commentary:
                                text_value = commentary["text"]
                                if isinstance(text_value, dict):
                                    post_text = text_value.get("text", "")
                                elif isinstance(text_value, str):
                                    post_text = text_value
                                else:
                                    post_text = str(text_value)

                        if not post_text:

                            summary = result.get("summary", {})
                            if isinstance(summary, dict):
                                summary_text = summary.get("text", "")
                                if summary_text:
                                    post_text = summary_text

                        if not post_text:
                            actor_nav = result.get("actorNavigationContext", {})
                            if isinstance(actor_nav, dict):
                                summary = actor_nav.get("summary", {})
                                if isinstance(summary, dict):
                                    summary_text = summary.get("text", "")
                                    if summary_text:
                                        post_text = summary_text

                        if not post_text:
                            text_fields = [
                                result.get("text"),
                                result.get("description"),
                                result.get("content"),
                            ]
                            for field_value in text_fields:
                                if field_value:
                                    if isinstance(field_value, dict):
                                        post_text = field_value.get(
                                            "text", ""
                                        ) or json.dumps(field_value, default=str)
                                    elif isinstance(field_value, str):
                                        post_text = field_value
                                    else:
                                        post_text = str(field_value)
                                    break

                        if not post_text:
                            post_text = ""

                        post_text_lower = post_text.lower() if post_text else ""
                        result_str = (
                            json.dumps(result, default=str).lower()
                            if isinstance(result, dict)
                            else str(result).lower()
                        )

                        keyword_lower = (
                            keyword.lower()
                            if isinstance(keyword, str)
                            else str(keyword).lower()
                        )
                        if (
                            keyword_lower in post_text_lower
                            or keyword_lower in result_str
                        ):
                            post_created_at = (
                                result.get("createdAt")
                                or result.get("created")
                                or result.get("time")
                                or result.get("publishedAt")
                                or result.get("createdTime")
                                or result.get("publishedTime")
                                or result.get("actorNavigationContext", {}).get(
                                    "createdAt"
                                )
                                or result.get("actorNavigationContext", {}).get(
                                    "created"
                                )
                                or ""
                            )

                            relative_time_str = None
                            secondary_subtitle = result.get("secondarySubtitle", {})
                            if isinstance(secondary_subtitle, dict):
                                relative_time_str = secondary_subtitle.get(
                                    "text", ""
                                ) or secondary_subtitle.get("accessibilityText", "")

                            if relative_time_str:
                                parsed_relative_time = parse_relative_time(
                                    relative_time_str
                                )
                                if parsed_relative_time:
                                    post_created_at = parsed_relative_time.isoformat()
                                    print(
                                        f"   📅 Parsed relative time '{relative_time_str}' -> {post_created_at}"
                                    )

                            author_name = ""
                            author_urn = ""
                            author_profile_url = ""

                            actor_nav = result.get("actorNavigationContext", {})
                            if isinstance(actor_nav, dict):
                                image = actor_nav.get("image", {})

                                if isinstance(image, dict):
                                    author_name = image.get("accessibilityText", "")

                                if not author_name:
                                    title = actor_nav.get("title", {})
                                    if isinstance(title, dict):
                                        title_text = title.get("text", "")
                                        if title_text:
                                            author_name = title_text

                                if not author_name and isinstance(image, dict):
                                    attributes = image.get("attributes", [])
                                    for attr in attributes:
                                        if isinstance(attr, dict):
                                            attr_accessibility = attr.get(
                                                "accessibilityText", ""
                                            )
                                            if attr_accessibility:
                                                author_name = attr_accessibility
                                                break

                                author_profile_url = actor_nav.get(
                                    "url", ""
                                ) or actor_nav.get("actorNavigationUrl", "")

                                if not author_urn:
                                    author_urn = (
                                        actor_nav.get("entityUrn", "")
                                        or actor_nav.get("trackingUrn", "")
                                        or (
                                            image.get("attributes", [{}])[0]
                                            .get("detailData", {})
                                            .get("nonEntityProfilePicture", {})
                                            .get("profile", {})
                                            .get("entityUrn", "")
                                            if image.get("attributes")
                                            and len(image.get("attributes", [])) > 0
                                            else ""
                                        )
                                    )

                            if not author_name:
                                headline = result.get("headline", {})
                                if isinstance(headline, dict):
                                    headline_text = headline.get("text", "")
                                    if headline_text:
                                        author_name = headline_text.split("•")[
                                            0
                                        ].strip()

                                    if not author_name:
                                        attributes = headline.get("attributes", [])
                                        for attr in attributes:
                                            if isinstance(attr, dict):
                                                detail_data = attr.get("detailData", {})
                                                if detail_data:
                                                    actor_name = detail_data.get(
                                                        "actorName", {}
                                                    )
                                                    if isinstance(actor_name, dict):
                                                        actor_text = actor_name.get(
                                                            "text", ""
                                                        )
                                                        if actor_text:
                                                            author_name = actor_text
                                                            break

                                                    if not author_urn:
                                                        author_urn = detail_data.get(
                                                            "urn", ""
                                                        ) or detail_data.get(
                                                            "profile", ""
                                                        )

                            if not author_name:
                                result_image = result.get("image", {})
                                if isinstance(result_image, dict):
                                    author_name = result_image.get(
                                        "accessibilityText", ""
                                    )

                                    if not author_name:
                                        accessibility_attrs = result_image.get(
                                            "accessibilityTextAttributes", []
                                        )
                                        for attr in accessibility_attrs:
                                            if (
                                                isinstance(attr, dict)
                                                and "text" in attr
                                            ):
                                                author_name = attr.get("text", "")
                                                break

                            likes = result.get(
                                "numLikes",
                                result.get("likes", result.get("likeCount", 0)),
                            )
                            comments = result.get(
                                "numComments",
                                result.get("comments", result.get("commentCount", 0)),
                            )
                            shares = result.get(
                                "numShares",
                                result.get("shares", result.get("shareCount", 0)),
                            )

                            post_url = (
                                result.get("navigationUrl")
                                or result.get("navigationContext", {}).get("url")
                                or result.get("url")
                                or result.get("postUrl")
                                or result.get("permalink")
                                or ""
                            )

                            if not post_url and tracking_urn:
                                if tracking_urn.startswith("urn:li:activity:"):
                                    post_url = f"https://www.linkedin.com/feed/update/{tracking_urn}"
                                elif "activity:" in tracking_urn:
                                    activity_id = (
                                        tracking_urn.split(":")[-1]
                                        if ":" in tracking_urn
                                        else tracking_urn
                                    )
                                    post_url = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}"

                            template = result.get("template", "")
                            entity_urn = result.get("entityUrn", "")
                            tracking_id = result.get("trackingId", "")

                            company_name = None
                            company_urn = None
                            entity_embedded = result.get("entityEmbeddedObject", {})
                            if isinstance(entity_embedded, dict):
                                title_obj = entity_embedded.get("title", {})
                                if isinstance(title_obj, dict):
                                    company_name = title_obj.get("text", "")

                                image_obj = entity_embedded.get("image", {})
                                if isinstance(image_obj, dict):
                                    attributes = image_obj.get("attributes", [])
                                    for attr in attributes:
                                        if isinstance(attr, dict):
                                            detail_data = attr.get("detailData", {})
                                            if detail_data:
                                                non_entity_company = detail_data.get(
                                                    "nonEntityCompanyLogo", {}
                                                )
                                                if isinstance(non_entity_company, dict):
                                                    company = non_entity_company.get(
                                                        "company", {}
                                                    )
                                                    if isinstance(company, dict):
                                                        company_urn = company.get(
                                                            "entityUrn", ""
                                                        )
                                                        break

                            media = result.get(
                                "media", result.get("images", result.get("image", []))
                            )
                            if not media:
                                actor_images = result.get("actorImages", [])
                                if actor_images:
                                    media = actor_images
                                else:
                                    actor_nav = result.get("actorNavigationContext", {})
                                    if isinstance(actor_nav, dict):
                                        nav_image = actor_nav.get("image", {})
                                        if nav_image:
                                            media = [nav_image]

                            post_data = {
                                "id": post_id_str,
                                "urn": tracking_urn or "",
                                "text": post_text,
                                "textPreview": post_text[:200] if post_text else "",
                                "keywords": [keyword],
                                "scrapedAt": datetime.now().isoformat(),
                                "authorName": author_name,
                                "authorUrn": author_urn,
                                "authorProfileUrl": author_profile_url,
                                "createdAt": post_created_at,
                                "updatedAt": result.get(
                                    "updatedAt", result.get("updated", "")
                                ),
                                "likes": likes,
                                "comments": comments,
                                "shares": shares,
                                "url": post_url,
                                "postType": result.get("type", template or "standard"),
                                "visibility": result.get(
                                    "visibility", result.get("privacy", "")
                                ),
                                "language": result.get("language", ""),
                                "entityUrn": entity_urn,
                                "trackingId": tracking_id,
                                "template": template,
                                "companyName": company_name,
                                "companyUrn": company_urn,
                                "relativeTime": (
                                    relative_time_str if relative_time_str else None
                                ),
                            }

                            if media:
                                if isinstance(media, list):
                                    post_data["media"] = media[:5]
                                else:
                                    post_data["media"] = [media]

                            all_posts.append(post_data)

            except Exception as keyword_error:
                import traceback

                print(
                    f"Warning: Error searching for keyword '{keyword}': {str(keyword_error)}"
                )
                print(f"   Traceback: {traceback.format_exc()}")
                continue

        if len(all_posts) == 0:
            try:
                if hasattr(linkedin_api, "get_feed_posts"):
                    feed_posts = linkedin_api.get_feed_posts(limit=limit, offset=offset)
                else:
                    feed_posts = []

                for post in feed_posts:
                    if not isinstance(post, dict):
                        continue

                    post_text_raw = (
                        post.get("text", "")
                        or post.get("commentary", "")
                        or post.get("summary", "")
                        or ""
                    )

                    if isinstance(post_text_raw, dict):
                        post_text_raw = json.dumps(post_text_raw, default=str)
                    elif not isinstance(post_text_raw, str):
                        post_text_raw = str(post_text_raw) if post_text_raw else ""

                    post_text = post_text_raw.lower() if post_text_raw else ""

                    for keyword in keywords:
                        if keyword.lower() in post_text:
                            post_id = post.get(
                                "urn",
                                post.get("id", post.get("activityUrn", str(post))),
                            )
                            if isinstance(post_id, str) and ":" in post_id:
                                post_id = post_id.split(":")[-1]

                            post_id_str = str(post_id)

                            if post_id_str in exclude_ids:
                                continue

                            post_created_at = post.get(
                                "createdAt", post.get("created", post.get("time", ""))
                            )

                            post_data = {
                                "id": str(post_id),
                                "urn": post.get("urn", post.get("activityUrn", "")),
                                "text": post_text if post_text else "",
                                "textPreview": post_text[:200] if post_text else "",
                                "keywords": [
                                    k for k in keywords if k.lower() in post_text
                                ],
                                "scrapedAt": datetime.now().isoformat(),
                            }

                            post_data["authorName"] = (
                                post.get("author", {}).get("name", "")
                                if isinstance(post.get("author"), dict)
                                else post.get("authorName", "")
                            )
                            post_data["createdAt"] = post_created_at
                            post_data["likes"] = post.get(
                                "numLikes", post.get("likes", post.get("likeCount", 0))
                            )
                            post_data["comments"] = post.get(
                                "numComments",
                                post.get("comments", post.get("commentCount", 0)),
                            )
                            post_data["shares"] = post.get(
                                "numShares",
                                post.get("shares", post.get("shareCount", 0)),
                            )
                            post_data["url"] = post.get("url", post.get("postUrl", ""))

                            all_posts.append(post_data)
                            break
            except Exception as feed_error:
                print(f"Warning: Error getting feed posts: {str(feed_error)}")

    except Exception as e:
        raise Exception(f"Error searching posts: {str(e)}")

    seen_ids = set()
    unique_posts = []
    for post in all_posts:
        if post["id"] not in seen_ids:
            seen_ids.add(post["id"])
            unique_posts.append(post)

    unique_posts.sort(key=get_post_date, reverse=True)

    print(
        f"✅ Search completed: {len(unique_posts)} unique posts found (sorted by date, newest first)"
    )
    print(f"📦 Raw search results: {len(all_raw_results)} items")

    return unique_posts, all_raw_results


@app.route("/search_posts", methods=["POST"])
def search_posts():
    """Search for posts with specific keywords"""
    try:
        data = request.json
        keywords = data.get("keywords", [])
        time_range = data.get("timeRange")

        if not keywords:
            return jsonify({"success": False, "error": "Keywords are required"}), 400

        calculated_days_back = 30
        if time_range and isinstance(time_range, dict):
            value = time_range.get("value", 30)
            unit = time_range.get("unit", "days").lower()

            if unit == "days":
                calculated_days_back = value
            elif unit == "months":
                calculated_days_back = value * 30
            elif unit == "years":
                calculated_days_back = value * 365
            else:
                calculated_days_back = value

        posts, raw_results = search_posts_by_keywords(
            keywords, days_back=calculated_days_back
        )

        return jsonify(
            {
                "success": True,
                "posts": posts,
                "count": len(posts),
                "raw_results": raw_results,
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/poll_posts", methods=["POST"])
def poll_posts():
    """Poll for new posts matching keywords (used by polling mechanism)"""
    global linkedin_api, scraped_posts, last_poll_timestamp, checked_post_ids

    if not linkedin_api:
        return (
            jsonify({"success": False, "error": "Not logged in. Please login first."}),
            401,
        )

    try:
        data = request.json
        keywords = data.get("keywords", [])
        client_offset = data.get("offset")
        time_range = data.get("timeRange")

        if not keywords:
            return jsonify({"success": False, "error": "Keywords are required"}), 400

        existing_ids = {post.get("id", str(post)) for post in scraped_posts}
        print(f"📋 Checking against {len(existing_ids)} existing scraped post IDs")
        print(f"📋 Already checked {len(checked_post_ids)} post IDs in previous polls")

        current_timestamp = datetime.now().isoformat()

        # Use offset from client request (extension manages offset)
        search_offset = client_offset if client_offset is not None else 0
        print(f"📥 Using offset from client: {search_offset}")

        exclude_ids = existing_ids.union(checked_post_ids)

        calculated_days_back = 30
        if time_range and isinstance(time_range, dict):
            value = time_range.get("value", 30)
            unit = time_range.get("unit", "days").lower()

            if unit == "days":
                calculated_days_back = value
            elif unit == "months":
                calculated_days_back = value * 30
            elif unit == "years":
                calculated_days_back = value * 365
            else:
                calculated_days_back = value

            print(
                f"📅 Time range from client: {value} {unit} ({calculated_days_back} days)"
            )
        else:
            print(f"📅 Using default time range: 30 days")

        print(f"🕐 Last poll: {last_poll_timestamp}, Request offset: {search_offset}")
        print(f"🚫 Excluding {len(exclude_ids)} already checked/scraped post IDs")

        all_found_posts, raw_search_results = search_posts_by_keywords(
            keywords,
            limit=50,
            offset=search_offset,
            days_back=calculated_days_back,
            exclude_ids=exclude_ids,
        )

        current_poll_checked_ids = set()

        new_posts = []
        duplicate_count = 0

        all_checked_posts = raw_search_results

        for post in all_found_posts:
            post_id = post.get("id", str(post))
            post_id_str = str(post_id)

            current_poll_checked_ids.add(post_id_str)

            if post_id_str not in existing_ids:
                new_posts.append(post)
            else:
                duplicate_count += 1

        checked_post_ids.update(current_poll_checked_ids)

        print(
            f"🔍 Found {len(all_found_posts)} total posts, {len(new_posts)} new, {duplicate_count} duplicates skipped"
        )
        print(
            f"📊 All checked posts: {len(all_checked_posts)}, Newly scraped: {len(new_posts)}"
        )
        print(
            f"📝 Tracked {len(current_poll_checked_ids)} new post IDs as checked. Total checked: {len(checked_post_ids)}"
        )

        if new_posts:
            scraped_posts.extend(new_posts)
            scraped_posts.sort(key=get_post_date, reverse=True)
            print(
                f"✅ Added {len(new_posts)} new posts. Total scraped: {len(scraped_posts)}"
            )
            last_poll_timestamp = current_timestamp

        # Note: Offset is now managed by the extension, not the backend
        print(f"📊 Returning {len(all_checked_posts)} checked posts to extension")

        return jsonify(
            {
                "success": True,
                "all_checked_posts": all_checked_posts,
                "scraped_posts": new_posts,
                "count": len(new_posts),
                "total_scraped": len(scraped_posts),
                "duplicates_skipped": duplicate_count,
                "last_poll_timestamp": last_poll_timestamp,
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/get_scraped_posts", methods=["GET"])
def get_scraped_posts():
    """Get all scraped post IDs (sorted by date, newest first)"""
    sorted_posts = sorted(scraped_posts, key=get_post_date, reverse=True)

    return jsonify({"success": True, "posts": sorted_posts, "count": len(sorted_posts)})


@app.route("/clear_posts", methods=["POST"])
def clear_posts():
    """Clear all scraped posts"""
    global scraped_posts, last_poll_timestamp, checked_post_ids
    scraped_posts = []
    last_poll_timestamp = None
    checked_post_ids = set()
    return jsonify({"success": True, "message": "All scraped posts cleared"})


@app.route("/logout", methods=["POST"])
def logout():
    """Logout from LinkedIn"""
    global linkedin_api
    linkedin_api = None
    return jsonify({"success": True, "message": "Logged out successfully"})


if __name__ == "__main__":
    print("🚀 Starting LinkedIn Scraper Backend Server...")
    print("📡 Server will run on http://localhost:8000")
    print("💡 Make sure to install dependencies: pip install -r requirements.txt")
    app.run(host="0.0.0.0", port=8000, debug=True)
