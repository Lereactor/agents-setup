from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mock_mode: bool = True
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = ""  # опционально: любой OpenAI-совместимый эндпоинт
    host: str = "127.0.0.1"
    port: int = 8000
    # Вкладка «Мои агенты»: Apps Script веб-хук лога (значения — из sheets_api.txt)
    sheets_log_url: str = ""
    sheets_log_token: str = ""


settings = Settings()
