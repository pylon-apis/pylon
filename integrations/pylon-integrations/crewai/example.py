"""Example usage of Pylon tools with CrewAI."""

from crewai import Agent, Task, Crew, Process
from pylon_tool import PylonTool, PylonScreenshotTool, PylonSearchTool, PylonScrapeTool


def main():
    # Create Pylon tools
    pylon_tool = PylonTool()
    screenshot_tool = PylonScreenshotTool()
    search_tool = PylonSearchTool()
    scrape_tool = PylonScrapeTool()
    
    # Define agents with Pylon capabilities
    researcher = Agent(
        role='Web Researcher',
        goal='Research topics thoroughly using web search and scraping',
        backstory='''You are an expert researcher who excels at finding 
        comprehensive information from the web using advanced AI tools.''',
        verbose=True,
        tools=[search_tool, scrape_tool, pylon_tool],
        allow_delegation=False
    )
    
    analyst = Agent(
        role='Content Analyst',
        goal='Analyze web content and create comprehensive reports',
        backstory='''You are a skilled analyst who can process web content 
        and screenshots to create detailed insights and reports.''',
        verbose=True,
        tools=[screenshot_tool, scrape_tool, pylon_tool],
        allow_delegation=False
    )
    
    # Define tasks
    research_task = Task(
        description='''Research the latest developments in AI agent frameworks. 
        Use web search to find recent articles and developments, then scrape 
        the most relevant pages for detailed information.''',
        expected_output='''A comprehensive research report with the latest 
        AI agent framework developments, including key findings and sources.''',
        agent=researcher
    )
    
    analysis_task = Task(
        description='''Take screenshots of the top AI framework websites 
        mentioned in the research and analyze their visual presentation 
        and feature highlights. Create a comparative analysis.''',
        expected_output='''A visual analysis report comparing AI framework 
        websites with screenshots and key feature comparisons.''',
        agent=analyst
    )
    
    # Create crew
    research_crew = Crew(
        agents=[researcher, analyst],
        tasks=[research_task, analysis_task],
        process=Process.sequential,
        verbose=True
    )
    
    # Execute the crew
    result = research_crew.kickoff()
    
    print("=== Crew Execution Results ===")
    print(result)


if __name__ == "__main__":
    main()