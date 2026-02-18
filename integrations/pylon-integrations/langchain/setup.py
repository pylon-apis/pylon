"""Setup configuration for LangChain Pylon integration."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="langchain-pylon",
    version="1.0.0",
    author="Pylon APIs",
    author_email="support@pylonapi.com",
    description="Pylon API Gateway tool integration for LangChain",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/pylon-apis/pylon",
    project_urls={
        "Homepage": "https://pylonapi.com",
        "Bug Tracker": "https://github.com/pylon-apis/pylon/issues",
        "Documentation": "https://docs.pylonapi.com",
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "langchain>=0.1.0",
        "requests>=2.25.0",
        "pydantic>=1.8.0",
    ],
    extras_require={
        "dev": [
            "pytest>=6.0",
            "pytest-cov>=2.0",
            "black>=21.0",
            "flake8>=3.8",
            "mypy>=0.910",
        ],
    },
    keywords=[
        "langchain",
        "pylon",
        "ai",
        "tools",
        "agents",
        "screenshot",
        "search",
        "scraping",
        "ocr",
        "translation",
    ],
)