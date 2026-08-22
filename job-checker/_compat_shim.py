# scrapegraphai 1.76.0 imports ChatOllama from langchain_community.chat_models,
# a re-export langchain-community removed as of 0.4.0 (which scrapegraphai's
# own pyproject.toml requires >=0.4.0) -- a real upstream bug in the current
# release, not a version mismatch on our end. The class still exists, just
# moved to langchain-ollama (already an scrapegraphai dependency). Aliasing
# it back onto the old import path is the correct fix: same class, same
# behavior, just the path their code still expects.
import langchain_community.chat_models as _cm
from langchain_ollama import ChatOllama as _ChatOllama
_cm.ChatOllama = _ChatOllama
