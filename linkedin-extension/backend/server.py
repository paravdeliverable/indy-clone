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


def filter_posts_only(search_results):
    """
    Filter out only posts from LinkedIn search results.
    Excludes job postings and other non-post content types.

    Args:
        search_results: List of search result items from LinkedIn API

    Returns:
        List of items that are actual posts (not job postings, etc.)
    """
    if not search_results:
        return []

    posts_only = []

    for result in search_results:
        if not result or not isinstance(result, dict):
            continue

        tracking_urn = result.get("trackingUrn", "")
        if tracking_urn and "job" in tracking_urn.lower():
            continue

        template = result.get("template", "")
        if template == "UNIVERSAL":
            has_commentary = result.get("commentary") is not None
            has_summary = result.get("summary") is not None
            has_title = (
                result.get("title", {}).get("text")
                if isinstance(result.get("title"), dict)
                else None
            )

            if has_title and not has_commentary and not has_summary:
                continue

        has_post_content = (
            result.get("commentary") is not None
            or result.get("summary") is not None
            or result.get("text") is not None
            or result.get("description") is not None
            or result.get("content") is not None
        )

        actor_nav = result.get("actorNavigationContext")
        if isinstance(actor_nav, dict):
            has_post_content = has_post_content or (
                actor_nav.get("summary") is not None
                or actor_nav.get("commentary") is not None
            )

        if has_post_content:
            posts_only.append(result)

    return posts_only


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


def search_posts_by_keywords(keywords, limit=50, offset=0, days_back=30):
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
    """
    global linkedin_api

    if not linkedin_api:
        raise Exception("Not logged in. Please login first.")

    if not keywords:
        raise Exception("Keywords are required")

    all_posts = []
    all_raw_results = []

    print(f"📊 Search params: limit={limit}, offset={offset}, days_back={days_back}")
    print(f"📅 API-level date filtering: last {days_back} days")
    print(f"🔍 Searching for keywords: {', '.join(keywords)}")

    try:
        if hasattr(linkedin_api, "search"):

            try:
                search_params = {
                    "keywords": " ".join(keywords),
                    "filters": "List((key:resultType,value:List(CONTENT)))",
                }
                search_results = linkedin_api.search(
                    search_params, limit=50, offset=offset
                )
                if search_results:
                    all_raw_results.extend(search_results)
                    print(f"   🔍 All raw results: {len(all_raw_results)}")

            except Exception as search_error:
                print(f"   ⚠️ search() with filters failed: {str(search_error)}")
                search_results = None

        if search_results:
            for result in search_results:
                if not result:
                    continue

                is_search_update_wrapper = False
                update_data = result

                if isinstance(result, dict) and "update" in result:
                    is_search_update_wrapper = True
                    update_data = result.get("update", {})
                    if not update_data:
                        continue

                actor_nav_for_urn = update_data.get("actorNavigationContext")
                actor_nav_urn_dict = (
                    actor_nav_for_urn if isinstance(actor_nav_for_urn, dict) else {}
                )

                if is_search_update_wrapper:
                    metadata = update_data.get("metadata", {})
                    tracking_urn = (
                        metadata.get("backendUrn", "")
                        or metadata.get("shareUrn", "")
                        or update_data.get("entityUrn", "")
                        or result.get("trackingUrn", "")
                    )
                else:
                    tracking_urn = (
                        update_data.get("trackingUrn")
                        or update_data.get("dashEntityUrn")
                        or update_data.get("entityUrn")
                        or update_data.get("urn")
                        or actor_nav_urn_dict.get("trackingUrn", "")
                        or actor_nav_urn_dict.get("entityUrn", "")
                    )

                post_id = None
                if tracking_urn:
                    if isinstance(tracking_urn, str) and ":" in tracking_urn:
                        parts = tracking_urn.split(":")
                        if len(parts) > 0:
                            post_id = parts[-1]

                if not post_id:
                    post_id = update_data.get("id") or result.get("id") or str(result)

                post_id_str = str(post_id)

                post_text = ""

                commentary = update_data.get("commentary", {})
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
                    summary = update_data.get("summary", {})
                    if isinstance(summary, dict):
                        summary_text = summary.get("text", "")
                        if summary_text:
                            post_text = summary_text

                if not post_text:
                    actor_nav = update_data.get("actorNavigationContext", {})
                    if isinstance(actor_nav, dict):
                        summary = actor_nav.get("summary", {})
                        if isinstance(summary, dict):
                            summary_text = summary.get("text", "")
                            if summary_text:
                                post_text = summary_text

                if not post_text:
                    text_fields = [
                        update_data.get("text"),
                        update_data.get("description"),
                        update_data.get("content"),
                    ]
                    for field_value in text_fields:
                        if field_value:
                            if isinstance(field_value, dict):
                                post_text = field_value.get("text", "") or json.dumps(
                                    field_value, default=str
                                )
                            elif isinstance(field_value, str):
                                post_text = field_value
                            else:
                                post_text = str(field_value)
                            break

                is_job_posting = False
                if tracking_urn and "job" in tracking_urn.lower():
                    is_job_posting = True
                elif (
                    update_data.get("template") == "UNIVERSAL"
                    or result.get("template") == "UNIVERSAL"
                ):
                    title_obj = update_data.get("title", {}) or result.get("title", {})
                    if isinstance(title_obj, dict) and title_obj.get("text"):
                        is_job_posting = True

                if is_job_posting:
                    title_obj = update_data.get("title", {}) or result.get("title", {})
                    if isinstance(title_obj, dict):
                        title_text = title_obj.get("text", "")
                        if title_text:
                            post_text = title_text

                            primary_subtitle = update_data.get(
                                "primarySubtitle", {}
                            ) or result.get("primarySubtitle", {})
                            if isinstance(primary_subtitle, dict):
                                company_text = primary_subtitle.get("text", "")
                                if company_text:
                                    post_text += f" at {company_text}"

                            secondary_subtitle = update_data.get(
                                "secondarySubtitle", {}
                            ) or result.get("secondarySubtitle", {})
                            if isinstance(secondary_subtitle, dict):
                                location_text = secondary_subtitle.get("text", "")
                                if location_text:
                                    post_text += f" - {location_text}"

                if not post_text:
                    post_text = ""

                post_text_lower = post_text.lower() if post_text else ""
                result_str = (
                    json.dumps(result, default=str).lower()
                    if isinstance(result, dict)
                    else str(result).lower()
                )
                if is_search_update_wrapper:
                    update_str = (
                        json.dumps(update_data, default=str).lower()
                        if isinstance(update_data, dict)
                        else str(update_data).lower()
                    )
                    result_str = result_str + " " + update_str

                matching_keywords = []
                for keyword in keywords:
                    keyword_lower = (
                        keyword.lower()
                        if isinstance(keyword, str)
                        else str(keyword).lower()
                    )
                    if keyword_lower in post_text_lower or keyword_lower in result_str:
                        matching_keywords.append(keyword)

                if matching_keywords:
                    actor_nav_context = update_data.get("actorNavigationContext")
                    actor_nav_dict = (
                        actor_nav_context if isinstance(actor_nav_context, dict) else {}
                    )

                    post_created_at = ""
                    if is_search_update_wrapper:
                        actor = update_data.get("actor", {})
                        if isinstance(actor, dict):
                            sub_description = actor.get("subDescription", {})
                            if isinstance(sub_description, dict):
                                relative_time_str = sub_description.get(
                                    "text", ""
                                ) or sub_description.get("accessibilityText", "")
                                if relative_time_str:
                                    parsed_relative_time = parse_relative_time(
                                        relative_time_str
                                    )
                                    if parsed_relative_time:
                                        post_created_at = (
                                            parsed_relative_time.isoformat()
                                        )

                    if not post_created_at:
                        post_created_at = (
                            update_data.get("createdAt")
                            or update_data.get("created")
                            or update_data.get("time")
                            or update_data.get("publishedAt")
                            or update_data.get("createdTime")
                            or update_data.get("publishedTime")
                            or actor_nav_dict.get("createdAt")
                            or actor_nav_dict.get("created")
                            or ""
                        )

                    relative_time_str = None
                    if is_search_update_wrapper:
                        actor = update_data.get("actor", {})
                        if isinstance(actor, dict):
                            sub_description = actor.get("subDescription", {})
                            if isinstance(sub_description, dict):
                                relative_time_str = sub_description.get(
                                    "text", ""
                                ) or sub_description.get("accessibilityText", "")
                    else:
                        secondary_subtitle = update_data.get("secondarySubtitle", {})
                        if isinstance(secondary_subtitle, dict):
                            relative_time_str = secondary_subtitle.get(
                                "text", ""
                            ) or secondary_subtitle.get("accessibilityText", "")

                    if is_job_posting and not post_created_at:
                        insights = update_data.get(
                            "insightsResolutionResults", []
                        ) or result.get("insightsResolutionResults", [])
                        if insights and len(insights) > 0:
                            job_insight = insights[0].get("jobPostingFooterInsight", {})
                            if isinstance(job_insight, dict):
                                footer_items = job_insight.get("footerItems", [])
                                if footer_items and len(footer_items) > 0:
                                    time_at = footer_items[0].get("timeAt")
                                    if time_at:
                                        try:
                                            post_created_at = datetime.fromtimestamp(
                                                time_at / 1000
                                            ).isoformat()
                                        except:
                                            pass

                    if relative_time_str and not post_created_at:
                        parsed_relative_time = parse_relative_time(relative_time_str)
                        if parsed_relative_time:
                            post_created_at = parsed_relative_time.isoformat()
                            print(
                                f"   📅 Parsed relative time '{relative_time_str}' -> {post_created_at}"
                            )

                    author_name = ""
                    author_urn = ""
                    author_profile_url = ""

                    if is_search_update_wrapper:
                        actor = update_data.get("actor", {})
                        if isinstance(actor, dict):
                            name_obj = actor.get("name", {})
                            if isinstance(name_obj, dict):
                                author_name = name_obj.get("text", "")

                            author_urn = actor.get("backendUrn", "")

                            nav_context = actor.get("navigationContext", {})
                            if isinstance(nav_context, dict):
                                author_profile_url = nav_context.get("actionTarget", "")

                    if is_job_posting and not author_name:
                        primary_subtitle = update_data.get(
                            "primarySubtitle", {}
                        ) or result.get("primarySubtitle", {})
                        if isinstance(primary_subtitle, dict):
                            company_text = primary_subtitle.get("text", "")
                            if company_text:
                                author_name = company_text

                    if not author_name:
                        actor_nav = update_data.get("actorNavigationContext", {})
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

                            if not author_profile_url:
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
                        headline = update_data.get("headline", {}) or result.get(
                            "headline", {}
                        )
                        if isinstance(headline, dict):
                            headline_text = headline.get("text", "")
                            if headline_text:
                                author_name = headline_text.split("•")[0].strip()

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
                                                actor_text = actor_name.get("text", "")
                                                if actor_text:
                                                    author_name = actor_text
                                                    break

                                            if not author_urn:
                                                author_urn = detail_data.get(
                                                    "urn", ""
                                                ) or detail_data.get("profile", "")

                    if not author_name:
                        result_image = update_data.get("image", {}) or result.get(
                            "image", {}
                        )
                        if isinstance(result_image, dict):
                            author_name = result_image.get("accessibilityText", "")

                            if not author_name:
                                accessibility_attrs = result_image.get(
                                    "accessibilityTextAttributes", []
                                )
                                for attr in accessibility_attrs:
                                    if isinstance(attr, dict) and "text" in attr:
                                        author_name = attr.get("text", "")
                                        break

                    if is_search_update_wrapper:
                        social_detail = update_data.get("socialDetail", {})
                        if isinstance(social_detail, dict):
                            total_counts = social_detail.get(
                                "totalSocialActivityCounts", {}
                            )
                            if isinstance(total_counts, dict):
                                likes = total_counts.get("numLikes", 0)
                                comments = total_counts.get("numComments", 0)
                                shares = total_counts.get("numShares", 0)
                            else:
                                likes = comments = shares = 0
                        else:
                            likes = comments = shares = 0
                    else:
                        likes = update_data.get(
                            "numLikes",
                            update_data.get("likes", update_data.get("likeCount", 0)),
                        )
                        comments = update_data.get(
                            "numComments",
                            update_data.get(
                                "comments", update_data.get("commentCount", 0)
                            ),
                        )
                        shares = update_data.get(
                            "numShares",
                            update_data.get("shares", update_data.get("shareCount", 0)),
                        )

                    post_url = ""
                    if is_search_update_wrapper:
                        header = update_data.get("header", {})
                        if isinstance(header, dict):
                            nav_context = header.get("navigationContext", {})
                            if isinstance(nav_context, dict):
                                post_url = nav_context.get("actionTarget", "")

                        if not post_url:
                            social_detail = update_data.get("socialDetail", {})
                            if isinstance(social_detail, dict):
                                post_url = social_detail.get("shareUrl", "")

                        if not post_url:
                            metadata = update_data.get("metadata", {})
                            if isinstance(metadata, dict):
                                backend_urn = metadata.get("backendUrn", "")
                                if backend_urn and "activity:" in backend_urn:
                                    activity_id = (
                                        backend_urn.split(":")[-1]
                                        if ":" in backend_urn
                                        else backend_urn
                                    )
                                    post_url = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}"
                    else:
                        post_url = (
                            update_data.get("navigationUrl")
                            or update_data.get("navigationContext", {}).get("url")
                            or update_data.get("url")
                            or update_data.get("postUrl")
                            or update_data.get("permalink")
                            or ""
                        )

                    if not post_url and tracking_urn:
                        if tracking_urn.startswith("urn:li:activity:"):
                            post_url = (
                                f"https://www.linkedin.com/feed/update/{tracking_urn}"
                            )
                        elif "activity:" in tracking_urn:
                            activity_id = (
                                tracking_urn.split(":")[-1]
                                if ":" in tracking_urn
                                else tracking_urn
                            )
                            post_url = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}"
                        elif tracking_urn.startswith("urn:li:job:"):
                            job_id = (
                                tracking_urn.split(":")[-1]
                                if ":" in tracking_urn
                                else tracking_urn
                            )
                            post_url = f"https://www.linkedin.com/jobs/view/{job_id}/"

                    template = update_data.get("template", "") or result.get(
                        "template", ""
                    )
                    entity_urn = update_data.get("entityUrn", "") or result.get(
                        "entityUrn", ""
                    )
                    tracking_id = result.get("trackingId", "") or update_data.get(
                        "trackingId", ""
                    )

                    company_name = None
                    company_urn = None

                    if is_search_update_wrapper:
                        metadata = update_data.get("metadata", {})
                        if isinstance(metadata, dict):
                            group = metadata.get("group", {})
                            if isinstance(group, dict):
                                company_name = group.get("name", "")
                                company_urn = group.get("entityUrn", "")

                        if not company_name:
                            content = update_data.get("content", {})
                            if isinstance(content, dict):
                                entity_component = content.get("entityComponent", {})
                                if isinstance(entity_component, dict):
                                    subtitle = entity_component.get("subtitle", {})
                                    if isinstance(subtitle, dict):
                                        company_name = subtitle.get("text", "")

                    if is_job_posting and not company_name:
                        primary_subtitle = update_data.get(
                            "primarySubtitle", {}
                        ) or result.get("primarySubtitle", {})
                        if isinstance(primary_subtitle, dict):
                            company_name = primary_subtitle.get("text", "")

                        image_obj = update_data.get("image", {}) or result.get(
                            "image", {}
                        )
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
                                                if not company_name:
                                                    company_name = company.get(
                                                        "name", company_name
                                                    )
                                                break

                    if not company_name or not company_urn:
                        entity_embedded = update_data.get(
                            "entityEmbeddedObject", {}
                        ) or result.get("entityEmbeddedObject", {})
                        if isinstance(entity_embedded, dict):
                            title_obj = entity_embedded.get("title", {})
                            if isinstance(title_obj, dict):
                                if not company_name:
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
                                                    if not company_urn:
                                                        company_urn = company.get(
                                                            "entityUrn", ""
                                                        )
                                                    if not company_name:
                                                        company_name = company.get(
                                                            "name", ""
                                                        )
                                                    break

                    media = None
                    if is_search_update_wrapper:
                        content = update_data.get("content", {})
                        if isinstance(content, dict):
                            image_component = content.get("imageComponent", {})
                            if image_component:
                                media = [image_component]
                            else:
                                entity_component = content.get("entityComponent", {})
                                if isinstance(entity_component, dict):
                                    entity_image = entity_component.get("image", {})
                                    if entity_image:
                                        media = [entity_image]
                    else:
                        media = update_data.get(
                            "media",
                            update_data.get("images", update_data.get("image", [])),
                        )
                        if not media:
                            actor_images = update_data.get("actorImages", [])
                            if actor_images:
                                media = actor_images
                            else:
                                actor_nav = update_data.get(
                                    "actorNavigationContext", {}
                                )
                                if isinstance(actor_nav, dict):
                                    nav_image = actor_nav.get("image", {})
                                    if nav_image:
                                        media = [nav_image]

                    post_type = (
                        update_data.get("type", "")
                        or result.get("type", "")
                        or template
                        or "standard"
                    )
                    if is_job_posting:
                        post_type = "JOB_POSTING"
                    elif is_search_update_wrapper:
                        post_type = "POST"

                    visibility = ""
                    language = ""
                    if is_search_update_wrapper:
                        metadata = update_data.get("metadata", {})
                        if isinstance(metadata, dict):
                            visibility = metadata.get("shareAudience", "")
                    else:
                        visibility = update_data.get(
                            "visibility", update_data.get("privacy", "")
                        )
                    language = update_data.get("language", "") or result.get(
                        "language", ""
                    )

                    post_data = {
                        "id": post_id_str,
                        "urn": tracking_urn or "",
                        "text": post_text,
                        "textPreview": post_text[:200] if post_text else "",
                        "keywords": matching_keywords,
                        "scrapedAt": datetime.now().isoformat(),
                        "authorName": author_name,
                        "authorUrn": author_urn,
                        "authorProfileUrl": author_profile_url,
                        "createdAt": post_created_at,
                        "updatedAt": update_data.get(
                            "updatedAt", update_data.get("updated", "")
                        )
                        or result.get("updatedAt", result.get("updated", "")),
                        "likes": likes,
                        "comments": comments,
                        "shares": shares,
                        "url": post_url,
                        "postType": post_type,
                        "visibility": visibility,
                        "language": language,
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

    except Exception as e:
        import traceback

        print(f"Warning: Error searching for keywords: {str(e)}")
        print(f"   Traceback: {traceback.format_exc()}")
        raise Exception(f"Error searching posts: {str(e)}")

    print(all_raw_results)

    return all_posts, all_raw_results


@app.route("/poll_posts", methods=["POST"])
def poll_posts():
    """Poll for new posts matching keywords (used by polling mechanism)"""
    global linkedin_api, scraped_posts, last_poll_timestamp

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

        current_timestamp = datetime.now().isoformat()

        search_offset = client_offset if client_offset is not None else 0
        print(f"📥 Using offset from client: {search_offset}")

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

        all_found_posts, raw_search_results = search_posts_by_keywords(
            keywords,
            limit=50,
            offset=search_offset,
            days_back=calculated_days_back,
        )

        print(f"🔍 Found {len(all_found_posts)} total posts in this poll")

        if all_found_posts:
            scraped_posts.extend(all_found_posts)
            scraped_posts.sort(key=get_post_date, reverse=True)
            last_poll_timestamp = current_timestamp
            print(
                f"✅ Appended {len(all_found_posts)} posts. Total scraped: {len(scraped_posts)}"
            )
        else:
            print("ℹ️ No posts found in this poll run")

        return jsonify(
            {
                "success": True,
                "all_checked_posts": raw_search_results,
                "scraped_posts": all_found_posts,
                "count": len(all_found_posts),
                "total_scraped": len(scraped_posts),
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
    global scraped_posts, last_poll_timestamp
    scraped_posts = []
    last_poll_timestamp = None
    return jsonify({"success": True, "message": "All scraped posts cleared"})


@app.route("/logout", methods=["POST"])
def logout():
    """Logout from LinkedIn"""
    global linkedin_api
    linkedin_api = None
    return jsonify({"success": True, "message": "Logged out successfully"})


if __name__ == "__main__":
    print("📡 Server will run on http://localhost:8000")
    app.run(host="0.0.0.0", port=8000, debug=True)
