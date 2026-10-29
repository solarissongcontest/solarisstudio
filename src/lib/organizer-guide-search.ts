type GuideQuestionLike = {
  question: string;
};

type GuideSectionLike<TQuestion extends GuideQuestionLike> = {
  title: string;
  description?: string;
  questions: readonly TQuestion[];
};

export function filterOrganizerGuideSections<
  TSection extends GuideSectionLike<GuideQuestionLike>,
>(sections: readonly TSection[], query: string): Array<Omit<TSection, "questions"> & { questions: TSection["questions"][number][] }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return sections
    .map((section) => {
      const sectionMatches = [section.title, section.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
      const questions = !normalizedQuery || sectionMatches
        ? [...section.questions]
        : section.questions.filter((item) =>
            item.question.toLocaleLowerCase().includes(normalizedQuery),
          );

      return {
        ...section,
        questions,
      };
    })
    .filter((section) => section.questions.length > 0);
}

export function countOrganizerGuideAnswers(
  sections: readonly { questions: readonly unknown[] }[],
) {
  return sections.reduce((total, section) => total + section.questions.length, 0);
}
