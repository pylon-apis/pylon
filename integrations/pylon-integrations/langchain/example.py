"""Example usage of Pylon tool with LangChain."""

from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from pylon_tool import PylonTool, create_pylon_screenshot_tool, create_pylon_search_tool


def main():
    # Initialize the language model
    llm = ChatOpenAI(model="gpt-4", temperature=0)
    
    # Create Pylon tools
    pylon_tool = PylonTool()
    screenshot_tool = create_pylon_screenshot_tool()
    search_tool = create_pylon_search_tool()
    
    tools = [pylon_tool, screenshot_tool, search_tool]
    
    # Create agent prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant with access to various AI capabilities via Pylon."),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])
    
    # Create agent
    agent = create_openai_functions_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    
    # Example 1: Web search
    print("=== Example 1: Web Search ===")
    result = agent_executor.invoke({
        "input": "Search for the latest news about AI developments"
    })
    print(result["output"])
    
    # Example 2: Screenshot
    print("\n=== Example 2: Screenshot ===")
    result = agent_executor.invoke({
        "input": "Take a screenshot of https://www.python.org"
    })
    print(result["output"])
    
    # Example 3: Multiple capabilities
    print("\n=== Example 3: Combined Usage ===")
    result = agent_executor.invoke({
        "input": "Search for information about OpenAI, then take a screenshot of their website"
    })
    print(result["output"])


if __name__ == "__main__":
    main()