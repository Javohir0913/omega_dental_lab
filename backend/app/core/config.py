from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "OMEGA DENTAL LAB CRM"
    API_V1: str = "/api/v1"

    DATABASE_URL: str = "postgresql+asyncpg://omega:omega_pass@db:5432/omega_crm"
    REDIS_URL: str = "redis://redis:6379/0"

    SECRET_KEY: str = "change_me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    FIRST_SUPERADMIN_USERNAME: str = "admin"
    FIRST_SUPERADMIN_PASSWORD: str = "admin123"
    FIRST_SUPERADMIN_NAME: str = "Super Admin"

    DEFAULT_LANG: str = "ru"
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_MB: int = 25
    CORS_ORIGINS: str = "http://localhost:5180"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def sync_database_url(self) -> str:
        """Alembic uchun (psycopg emas, asyncpg driverini olib tashlaymiz)."""
        return self.DATABASE_URL.replace("+asyncpg", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
