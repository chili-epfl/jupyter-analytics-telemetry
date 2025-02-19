import os
import uuid
from hashlib import sha256
from jupyter_server.config_manager import BaseJSONConfigManager

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

class RouteHandler(APIHandler):
    # the following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        # return the anonymized user identifier
        self.finish(self.user_id)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # get the SCIPER identifier if available
        user_id = os.getenv('JUPYTERHUB_USER')

        if not user_id :
            # get randomly generated user_id from persisting config, and create one if not found
            config_dir_path = os.path.join(os.path.expanduser('~'), '.jupyter/lab/user-settings/jupyterlab_unianalytics')
            json_filename = 'unianalytics_user_info'

            cm = BaseJSONConfigManager(config_dir=config_dir_path)
            cm.ensure_config_dir_exists()

            user_id = cm.get(json_filename).get('user_id')

            if not user_id :
                user_id = str(uuid.uuid4())
                cm.set(json_filename, { 'user_id': user_id })

        self.user_id = user_id

def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, "jupyterlab-unianalytics-telemetry", "get_user_id")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)
