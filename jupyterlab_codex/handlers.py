from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado.escape import json_encode, json_decode
import tornado
import openai

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        if len(self.request.body) == 0:
            self.set_status(400)
            self.finish(json_encode({ "message": "no body provided" }))
            return

        data = json_decode(self.request.body)
        openai.api_key = data.get("api_key")
        response = openai.ChatCompletion.create(
                model=data.get("engine", "gpt-3.5-turbo"),
                messages=data.get("messages", []))

        self.finish(json_encode(response))


def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, "jupyterlab-codex", "completion")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)
