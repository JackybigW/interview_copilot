from services.glm_structured_service import normalize_loose_resume_payload


def test_normalize_loose_resume_payload_maps_real_glm_shape():
    raw_payload = {
        "基本信息": {
            "姓名": "王子飏",
            "英文名": "Jacky",
            "邮箱": "jackyw1205@gmail.com",
            "电话": "+86 13776699305",
            "意向岗位": "AI 数据运营 / 大模型评测与交付",
        },
        "教育经历": [
            {
                "学校": "爱丁堡大学",
                "时间": "2018–2022",
                "专业": "Master of Science with Honours in Mathematics (数学本硕连读)",
            }
        ],
        "专业技能": {
            "AI技术与协作": "基于 LangGraph 与 FastAPI 完成 0-1 建设。",
            "Prompt Engineering与幻觉治理": "通过 Pydantic 规则校验与 Python 模糊匹配，将结构化输出幻觉率控制在 1%以内。",
            "大模型评测": "独立设计并搭建大模型 Eval Pipeline。",
            "数据分析": "熟练使用 SQL。",
            "语言能力": "雅思 8.0",
        },
        "工作经历": [
            {
                "公司": "暴叔讲留学（千万粉丝头部 IP）",
                "时间": "2023.12–至今",
                "职位": "智能体项目开发与数据评测治理",
                "工作内容": [
                    {
                        "职责": "0-1 负责项目落地与交付",
                        "详情": "独立完成“暴叔 AI 分身”全流程建设。",
                    },
                    {
                        "职责": "支撑业务目标达成",
                        "详情": "帮助业务线在 2025 年实现 GMV 同比增长 400%。",
                    },
                ],
            }
        ],
        "项目经历": [
            {
                "项目名称": "大模型评测体系搭建与黄金数据集治理",
                "角色": "标注规范制定 / 自动化评测 / Failure Analysis",
                "项目内容": [
                    "构建包含 2,000+ 真实高噪与边界 case 的黄金数据集。",
                    "建立 Failure Analysis 机制与 Badcase 持续回流闭环。",
                ],
            }
        ],
        "个人优势": [
            "大模型评测体系搭建",
            "Agent / Workflow 自动化提效",
        ],
    }

    profile = normalize_loose_resume_payload(raw_payload)

    assert profile.candidate_name == "王子飏"
    assert "爱丁堡大学" in profile.education[0]
    assert "SQL" in " ".join(profile.technical_skills)
    assert profile.work_experiences[0].company == "暴叔讲留学（千万粉丝头部 IP）"
    assert "GMV 同比增长 400%" in " ".join(profile.work_experiences[0].achievements)
    assert profile.projects[0].name == "大模型评测体系搭建与黄金数据集治理"
    assert profile.strongest_points


def test_normalize_loose_resume_payload_handles_nested_lists_and_dicts():
    raw_payload = {
        "基本信息": {"姓名": "Jacky"},
        "专业技能": [
            "Prompt Engineering",
            {"语言能力": ["英语", "中文"]},
        ],
        "技术与工具": {
            "AI / LLM": ["OpenAI API", "LangGraph"],
            "后端 / 工程": {
                "languages": ["Python"],
                "storage": ["PostgreSQL", "Redis"],
            },
        },
        "工作经历": [
            {
                "公司": "Test Co",
                "职位": "AI Engineer",
                "时间": "2024",
                "职责与成果": [
                    "搭建评测流水线",
                    {"职责": "质量提升", "成果": "准确率提升 15%"},
                ],
            }
        ],
        "项目经历": [
            {
                "项目名称": "Resume Copilot",
                "角色": "Owner",
                "技术栈": {
                    "frontend": ["React"],
                    "backend": ["FastAPI"],
                },
                "亮点": ["支持 fallback", "避免空白结果"],
            }
        ],
        "个人优势": "结构化抽取与评测",
    }

    profile = normalize_loose_resume_payload(raw_payload)

    assert profile.candidate_name == "Jacky"
    assert "OpenAI API" in profile.technical_skills
    assert "Python" in profile.technical_skills
    assert "英语" in profile.soft_skills
    assert profile.projects[0].tech_stack == ["React", "FastAPI"]
    assert "质量提升：准确率提升 15%" in profile.work_experiences[0].achievements
